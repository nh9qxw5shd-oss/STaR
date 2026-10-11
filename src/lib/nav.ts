// Navigation model shared by the app shell and the command palette.

import { LayoutGrid, LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Incident", items: [{ href: "/", label: "Board", icon: LayoutGrid, desc: "Stranded trains on the selected incident, with live risk and plans" }] },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
