import { describe, expect, it } from "bun:test";
import { createHyprPay } from "../src/create-hyprpay";
import type { HyprPayPlugin, HyprPayRuntimeEvent } from "../src/contracts/hyprpay-plugin";

describe("createHyprPay", () => {
  it("mounts plugin api namespaces", () => {
    const plugin: HyprPayPlugin<"ops", { ping(): string }> = {
      id: "ops",
      namespace: "ops",
      extendApi: () => ({
        ping: () => "pong",
      }),
    };

    const hyprpay = createHyprPay({
      plugins: [plugin] as const,
    });

    expect(hyprpay.api.ops.ping()).toBe("pong");
  });

  it("mounts plugin routes and lifecycle hooks", async () => {
    const observedEvents: HyprPayRuntimeEvent[] = [];

    const plugin: HyprPayPlugin<"ops", { emit(): Promise<void> }> = {
      id: "ops-plugin",
      namespace: "ops",
      extendApi: runtime => ({
        emit: async () => {
          await runtime.emit({
            type: "ops.manual",
            payload: { ok: true },
          });
        },
      }),
      routes: [
        {
          method: "GET",
          path: "/plugins/ops-plugin/hello",
          handler: async request =>
            Response.json({
              header: request.headers.get("x-plugin-request"),
            }),
        },
      ],
      hooks: {
        onRequest: async request => {
          const headers = new Headers(request.headers);
          headers.set("x-plugin-request", "1");
          return new Request(request, { headers });
        },
        onResponse: async response => {
          const headers = new Headers(response.headers);
          headers.set("x-plugin-response", "ok");
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        },
        onEvent: async event => {
          observedEvents.push(event);
        },
      },
    };

    const hyprpay = createHyprPay({
      plugins: [plugin] as const,
    });

    const routeResponse = await hyprpay.handler(
      new Request("https://example.com/plugins/ops-plugin/hello", { method: "GET" }),
    );
    const routeBody = await routeResponse.json();
    const routeHeader = typeof routeBody === "object" && routeBody !== null ? Reflect.get(routeBody, "header") : null;

    expect(routeHeader).toBe("1");
    expect(routeResponse.headers.get("x-plugin-response")).toBe("ok");

    await hyprpay.api.ops.emit();

    expect(observedEvents).toEqual([
      {
        type: "ops.manual",
        payload: { ok: true },
      },
    ]);
  });

  it("rejects duplicate plugin ids", () => {
    expect(() =>
      createHyprPay({
        plugins: [
          {
            id: "dup-plugin",
            namespace: "first",
          },
          {
            id: "dup-plugin",
            namespace: "second",
          },
        ] as const,
      }),
    ).toThrow("Duplicate HyprPay plugin id: dup-plugin.");
  });

  it("rejects duplicate plugin routes", () => {
    expect(() =>
      createHyprPay({
        plugins: [
          {
            id: "alpha",
            namespace: "alpha",
            routes: [
              {
                method: "POST",
                path: "/same",
                handler: async () => Response.json({ ok: true }),
              },
            ],
          },
          {
            id: "beta",
            namespace: "beta",
            routes: [
              {
                method: "POST",
                path: "/same",
                handler: async () => Response.json({ ok: true }),
              },
            ],
          },
        ] as const,
      }),
    ).toThrow("Duplicate HyprPay route registration: POST /same is already owned by alpha.");
  });

  it("returns 404 when no plugin route matches", async () => {
    const hyprpay = createHyprPay({ plugins: [] as const });
    const response = await hyprpay.handler(new Request("https://example.com/missing", { method: "GET" }));
    const body = await response.json();
    const success = typeof body === "object" && body !== null ? Reflect.get(body, "success") : undefined;

    expect(response.status).toBe(404);
    expect(success).toBe(false);
  });
});
