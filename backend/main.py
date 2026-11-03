import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

CAPACITY = 800
DB = Path(__file__).parent / "appliances.db"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class NewAppliance(BaseModel):
    name: str
    wattage: int
    priority: int


class Switch(BaseModel):
    state: str


def get_db():
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    return connection


def used_watts(connection):
    return connection.execute(
        "SELECT COALESCE(SUM(wattage), 0) FROM appliances WHERE state = 'running'"
    ).fetchone()[0]


def result(connection, messages=None):
    rows = connection.execute("SELECT * FROM appliances ORDER BY priority, name").fetchall()
    used = used_watts(connection)
    return {
        "capacity": CAPACITY,
        "used": used,
        "free": CAPACITY - used,
        "appliances": [dict(row) for row in rows],
        "messages": messages or [],
    }


def find(connection, appliance_id):
    appliance = connection.execute(
        "SELECT * FROM appliances WHERE id = ?", (appliance_id,)
    ).fetchone()
    if appliance is None:
        raise HTTPException(404, "Appliance not found.")
    return appliance


def restore(connection, messages):
    """Put shed appliances back: most important first, then the one waiting longest."""
    free = CAPACITY - used_watts(connection)
    waiting = connection.execute(
        "SELECT * FROM appliances WHERE state = 'shed' ORDER BY priority, shed_at"
    ).fetchall()

    for appliance in waiting:
        if appliance["wattage"] <= free:
            connection.execute(
                "UPDATE appliances SET state = 'running', shed_at = NULL WHERE id = ?",
                (appliance["id"],),
            )
            free -= appliance["wattage"]
            messages.append(f"{appliance['name']} was switched back on automatically.")


def turn_on(connection, appliance, messages):
    if appliance["state"] == "running":
        return

    missing = appliance["wattage"] - (CAPACITY - used_watts(connection))

    if missing > 0:
        candidates = connection.execute(
            """
            SELECT * FROM appliances
            WHERE state = 'running' AND priority > ?
            ORDER BY priority DESC, wattage DESC
            """,
            (appliance["priority"],),
        ).fetchall()

        victims, freed = [], 0
        for candidate in candidates:
            if freed >= missing:
                break
            victims.append(candidate)
            freed += candidate["wattage"]

        if freed < missing:
            raise HTTPException(
                409,
                f"Cannot switch on {appliance['name']}: {missing - freed} W short even "
                f"after switching off every less important appliance. Nothing changed.",
            )

        for victim in victims:
            connection.execute(
                "UPDATE appliances SET state = 'shed', shed_at = ? WHERE id = ?",
                (datetime.now().isoformat(), victim["id"]),
            )
            messages.append(
                f"{victim['name']} ({victim['wattage']} W) was shed to make room for "
                f"{appliance['name']}."
            )

    connection.execute(
        "UPDATE appliances SET state = 'running', shed_at = NULL WHERE id = ?",
        (appliance["id"],),
    )
    messages.append(f"{appliance['name']} is on.")


def turn_off(connection, appliance, messages):
    connection.execute(
        "UPDATE appliances SET state = 'off', shed_at = NULL WHERE id = ?",
        (appliance["id"],),
    )
    messages.append(f"{appliance['name']} is off.")

    if appliance["state"] == "running":
        restore(connection, messages)


@app.get("/appliances")
def get_appliances():
    connection = get_db()
    try:
        return result(connection)
    finally:
        connection.close()


@app.post("/appliances")
def add_appliance(new: NewAppliance):
    connection = get_db()
    try:
        connection.execute(
            "INSERT INTO appliances (name, wattage, priority, state) VALUES (?, ?, ?, 'off')",
            (new.name, new.wattage, new.priority),
        )
        connection.commit()
        return result(connection, [f"{new.name} was added."])
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"'{new.name}' already exists or has invalid values.")
    finally:
        connection.close()


@app.put("/appliances/{appliance_id}")
def switch_appliance(appliance_id: int, switch: Switch):
    connection = get_db()
    try:
        appliance = find(connection, appliance_id)
        messages = []

        if switch.state == "on":
            turn_on(connection, appliance, messages)
        else:
            turn_off(connection, appliance, messages)

        connection.commit()
        return result(connection, messages)
    finally:
        connection.close()


@app.delete("/appliances/{appliance_id}")
def delete_appliance(appliance_id: int):
    connection = get_db()
    try:
        appliance = find(connection, appliance_id)
        connection.execute("DELETE FROM appliances WHERE id = ?", (appliance_id,))

        messages = [f"{appliance['name']} was deleted."]
        if appliance["state"] == "running":
            restore(connection, messages)

        connection.commit()
        return result(connection, messages)
    finally:
        connection.close()

