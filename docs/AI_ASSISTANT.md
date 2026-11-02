# UMED-2 Cloud-Only AI Data Assistant

## 1. Zero On-Device LLM Policy
UMED-2 enforces an uncompromising architectural decision:
- **No local neural models**: No GGUF, ONNX, Wasm LLM, or PyTorch mobile weights are embedded or downloaded.
- **Rationale**: Mobile target devices have limited RAM, shared CPU/GPU limits, and aggressive OS background process termination. Running models locally degrades battery life and causes frequent out-of-memory crashes.
- **Cloud-Only Architecture**: When internet is present and a valid Google Gemini API key is supplied, requests are sent securely to Google's cloud infrastructure via the modern `@google/genai` TypeScript SDK using `gemini-3.8-flash`.

## 2. Key Capabilities
1. **Medical Term Extraction**: Identifies medical terms, definitions, phonetic guides, and Arabic translations.
2. **Clinical MCQ Extraction**: Generates USMLE-style questions, 4 options, verified correct key, and clinical explanations.
3. **Clinical Case Extraction**: Patient history, chief complaint, physical exam findings, and differential diagnosis.
4. **Multimodal Medical Image Analysis**: Analyzes ECG strips, anatomical diagrams, histology slides, and tables.

## 3. Clinical Veracity & Anti-Hallucination Guardrails
- **Grounding in Source**: Prompts explicitly forbid inventing facts, dosages, or diagnoses not present in the source document.
- **Source Attribution**: Extracted items retain their source quote and page number.
- **Confidence Estimation**: An automated confidence score (0-100%) is assigned to each extraction.
- **Mandatory User Review**: The AI assistant has zero direct database write permissions. All outputs must pass through the **Review & Staging** screen for user verification.
- **Prompt Injection Defense**: Uploaded text is enclosed in strict data quotes, preventing injected instructions from altering system rules.
