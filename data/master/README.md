# UMEDT Master Medical Data

This folder is the canonical, version-controlled source for centrally maintained medical data.

## Data files

Add or update these UTF-8 JSON files as arrays of records matching the TypeScript interfaces in `src/types/lexicon.ts`:

- `terms.json` — `DictionaryTerm[]`
- `sentences.json` — `LinkedSentence[]`
- `topics.json` — `TopicArticle[]`
- `custom-affixes.json` — `MorphologicalAffix[]`
- `custom-abbreviations.json` — `ClinicalAbbreviation[]`

The release publisher validates record IDs and duplicate normalized terms before building a signed OTA package.

## Bootstrap behavior

For each missing master file, the publisher falls back to the corresponding bundled application seed data (terms, sentences, topics, affixes, and abbreviations). Once a master JSON file exists, that file becomes authoritative for its domain; an explicit empty array therefore publishes an empty domain. This keeps initial releases reproducible while allowing each domain to migrate independently.

Do not invent WHO/UMD identifiers or medical source citations. Include provenance in the record content when available, and review medical changes before publishing.

After the first successful data-release workflow, the stable manifest is published at:

`https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable/manifest.json`

Packages are attached to GitHub Releases under tags `data-v{version}`.
