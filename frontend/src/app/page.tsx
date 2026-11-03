"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

type Appliance = {
  id: number;
  name: string;
  wattage: number;
  priority: number;
  state: "running" | "off" | "shed";
};

type System = {
  capacity: number;
  used: number;
  free: number;
  appliances: Appliance[];
  messages: string[];
};

const STATE_COLOR = {
  running: "bg-green-50 text-green-700 border border-green-200",
  shed: "bg-amber-50 text-amber-700 border border-amber-200",
  off: "bg-gray-50 text-gray-500 border border-gray-200",
};

export default function Home() {
  const [system, setSystem] = useState<System | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", wattage: "", priority: "1" });

  const send = useCallback(async (path: string, options?: RequestInit) => {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await response.json();

    if (!response.ok) {
      setMessages([data.detail]);
      return;
    }

    setSystem(data);
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    send("/appliances");
  }, [send]);

  const addAppliance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await send("/appliances", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        wattage: Number(form.wattage),
        priority: Number(form.priority),
      }),
    });
    setForm({ name: "", wattage: "", priority: "1" });
  };

  const switchAppliance = (id: number, state: "on" | "off") =>
    send(`/appliances/${id}`, { method: "PUT", body: JSON.stringify({ state }) });

  const deleteAppliance = (id: number) =>
    send(`/appliances/${id}`, { method: "DELETE" });

  const capacity = system?.capacity ?? 800;
  const used = system?.used ?? 0;
  const percent = Math.round((used / capacity) * 100);

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col bg-white p-6 text-gray-800">
      <h1 className="mb-4 text-xl font-medium text-gray-900">Inverter load manager</h1>

      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>{used} W used</span>
        <span>{system?.free ?? capacity} W free of {capacity} W</span>
      </div>
      <div className="mb-6 h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${percent >= 90 ? "bg-red-400" : "bg-green-400"}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {messages.length > 0 && (
        <ul className="mb-6 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <form onSubmit={addAppliance} className="flex h-fit flex-col gap-3 rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-900">Add appliance</h2>

          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-800 focus:border-gray-400 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Wattage
            <input
              type="number"
              required
              min={1}
              value={form.wattage}
              onChange={(e) => setForm({ ...form, wattage: e.target.value })}
              className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-800 focus:border-gray-400 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Priority (1 = most important)
            <input
              type="number"
              required
              min={1}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-800 focus:border-gray-400 focus:outline-none"
            />
          </label>

          <button type="submit" className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700">
            Add
          </button>
        </form>

        <ul className="min-h-0 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {system?.appliances.length === 0 && (
            <li className="p-4 text-center text-sm text-gray-400">No appliances yet</li>
          )}

          {system?.appliances.map((appliance) => (
            <li key={appliance.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{appliance.name}</p>
                <p className="text-xs text-gray-400">
                  {appliance.wattage} W · priority {appliance.priority}
                </p>
              </div>

              <span className={`rounded-full px-2 py-0.5 text-xs ${STATE_COLOR[appliance.state]}`}>
                {appliance.state}
              </span>

              <button
                onClick={() => switchAppliance(appliance.id, "on")}
                disabled={appliance.state === "running"}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ON
              </button>
              <button
                onClick={() => switchAppliance(appliance.id, "off")}
                disabled={appliance.state === "off"}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                OFF
              </button>
              <button
                onClick={() => deleteAppliance(appliance.id)}
                className="px-1 text-xs text-red-400 hover:text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

