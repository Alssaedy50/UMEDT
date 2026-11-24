# UMEDT Interactive Mind Maps — Import & AI Authoring Guide

## What the Library portal accepts

The **My Library → Interactive Mind Maps** portal accepts:

- **UMEDT / graph JSON**: a JSON object containing `title`, `nodes`, and optional `edges`.
- **Nested tree JSON**: nested `children`, `branches`, or `subtopics` structures.
- **Markdown**: headings (`#`, `##`) and nested bullet lists.
- **Plain text outlines**: indented lines, numbered hierarchy, or ASCII tree connectors.
- **Flow text**: nodes connected with `->` arrows.

Supported upload extensions are `.json`, `.md`, `.markdown`, and `.txt`. The same content can be pasted into the importer.

## How recognition works

1. The importer reads the selected text file locally in the browser; it does not upload the source file to a server.
2. It first looks for a valid JSON object (including fenced JSON returned by an AI assistant).
3. If JSON is not found or is not a supported map structure, it detects Markdown headings/lists, numbered or indented outlines, ASCII trees, and flow arrows.
4. It builds node IDs and parent-child relationships, infers medical roles when they are not supplied, and reads explicit edge relationships when present.
5. The preview reports the detected format, node count, relationship count, hierarchy depth, and any parsing warnings.
6. The user confirms the import. The map is stored in the app's local mind-map store and appears in the Library portal.

**Important limitations:** the current importer does not perform OCR and does not extract diagrams from images, screenshots, PDFs, or Office documents. Convert those sources to text/Markdown or structured JSON first. A file extension alone does not make a diagram readable; the file must contain a supported textual structure.

## Recommended JSON structure

```json
{
  "title": "Hypertension",
  "titleEn": "Hypertension",
  "style": "hierarchical",
  "nodes": [
    {
      "id": "root",
      "label": "Hypertension",
      "sublabel": "ارتفاع ضغط الدم",
      "note": "Full explanation for the central node. This field can contain multiple paragraphs, mechanisms, examples, and clinical details.",
      "parentId": null,
      "role": "root",
      "shape": "rounded",
      "color": "#0f766e"
    },
    {
      "id": "n1",
      "label": "Pathophysiology",
      "sublabel": "الفيزيولوجيا المرضية",
      "note": "Detailed explanation without a fixed character limit in the node detail field.",
      "parentId": "root",
      "role": "mechanism",
      "shape": "diamond",
      "color": "#2563eb"
    }
  ],
  "edges": [
    { "id": "e1", "sourceId": "root", "targetId": "n1", "label": "includes" }
  ]
}
```

### Node fields

- `id`: unique ID within this map.
- `label`: concise node heading.
- `sublabel`: optional translation or secondary heading.
- `note`: complete explanation. Keep long paragraphs here rather than compressing them into the node heading.
- `parentId`: parent node ID; use `null` for the root.
- `role`: `root`, `concept`, `mechanism`, `diagnosis`, `treatment`, or `warning`.
- `shape`: `rounded`, `pill`, `diamond`, `hexagon`, or `circle`.
- `color`: six-digit HEX color such as `#2563eb`.

## AI prompt

Use the **Copy AI prompt** action inside the portal. Replace the subject placeholder, ask the AI to return only valid JSON, and import the generated response. The prompt asks for concise labels, detailed node notes, parent-child IDs, explicit edges, medical roles, and per-node colors/shapes.

## Sequential study and sharing

- Use **Next** and **Previous** to move through nodes in hierarchy order.
- Select a numbered node marker to jump directly to it.
- Read or edit the selected node's full explanation in the detail editor.
- Set a node's color and shape independently.
- Use **Share interactive HTML** to generate a self-contained HTML map. It can be shared as a file and opened independently; the app does not require a cloud connection to export it.
