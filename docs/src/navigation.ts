export const site = {
  name: "HyprPay",
  description: "Billing em TypeScript para produtos SaaS brasileiros.",
  url: "https://hyprpay.dev",
};

export const topNavItems = [
  { href: "/", label: "README" },
  { href: "/quickstart", label: "DOCS" },
  { href: "/architecture", label: "ARCHITECTURE" },
  { href: "/gateways", label: "GATEWAYS" },
];

export const sidebarGroups = [
  {
    label: "Get Started",
    items: [
      {
        href: "/",
        label: "Introduction",
        sections: [
          { href: "#what-is", label: "What is HyprPay" },
          { href: "#example", label: "Server instance" },
        ],
      },
      {
        href: "/quickstart",
        label: "Installation",
        sections: [
          { href: "#steps", label: "Steps" },
          { href: "#config", label: "Config" },
          { href: "#checkout", label: "Checkout" },
        ],
      },
      {
        href: "/architecture",
        label: "Architecture",
        sections: [
          { href: "#design", label: "Design" },
          { href: "#boundaries", label: "Repo boundaries" },
          { href: "#invariants", label: "Runtime rules" },
        ],
      },
      {
        href: "/cli",
        label: "CLI",
        sections: [
          { href: "#commands", label: "Commands" },
          { href: "#config", label: "Config" },
          { href: "#production", label: "Production" },
          { href: "#telemetry", label: "Telemetry" },
        ],
      },
    ],
  },
  {
    label: "Core",
    items: [
      {
        href: "/entitlements",
        label: "Entitlements",
        sections: [
          { href: "#types", label: "Types" },
          { href: "#before", label: "Before" },
          { href: "#after", label: "After" },
        ],
      },
      {
        href: "/gateways",
        label: "Gateways",
        sections: [
          { href: "#providers", label: "Providers" },
          { href: "#boundary", label: "Adapter boundary" },
        ],
      },
    ],
  },
  {
    label: "Integrations",
    items: [
      {
        href: "/better-auth",
        label: "Better Auth",
        sections: [
          { href: "#server", label: "Server" },
          { href: "#client", label: "Client" },
          { href: "#upgrade", label: "Upgrade" },
        ],
      },
    ],
  },
];
