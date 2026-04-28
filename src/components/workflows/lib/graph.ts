import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";

const NODE_W = 220;
const NODE_H = 80;

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

export function validateGraph(nodes: Node[], edges: Edge[]): { ok: boolean; error?: string } {
  const triggers = nodes.filter((n) => (n.data as any)?.kind === "trigger");
  if (triggers.length !== 1) return { ok: false, error: "Workflow must have exactly one trigger node." };
  // cycle check
  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => adj[e.source]?.push(e.target));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color: Record<string, number> = {};
  nodes.forEach((n) => (color[n.id] = WHITE));
  const dfs = (u: string): boolean => {
    color[u] = GRAY;
    for (const v of adj[u] || []) {
      if (color[v] === GRAY) return true;
      if (color[v] === WHITE && dfs(v)) return true;
    }
    color[u] = BLACK;
    return false;
  };
  for (const n of nodes) if (color[n.id] === WHITE && dfs(n.id)) return { ok: false, error: "Graph contains a cycle." };
  return { ok: true };
}

export function newId(prefix = "n"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
