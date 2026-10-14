# Contributing to WEAKSAUCE

Thank you for contributing to **WEAKSAUCE** — the Brutalist 3-Piece Rock Studio Audio Utility Suite.

## Creating a Feature Branch and Pull Request

To propose a new audio tool, DSP improvement, or UI refinement, follow these steps:

1. **Create a New Feature Branch** off `main` using a descriptive branch name:

```bash
git checkout main
git pull origin main
git checkout -b feature/<descriptive-feature-name>
```

2. **Implement and Verify Your Change:**
   - Ensure all API payloads and responses are strictly validated with TypeScript interfaces and Pydantic schemas (`backend/models/schemas.py`).
   - Do not introduce hardcoded names or environment-specific strings; use configuration variables.
   - Maintain the rotating `1 MB` (3-backup) localized `EST` console + file logger (`backend/utils/logger.py`) including timestamp, function name, and line number.
   - Do not add user authentication or login gates; **weaksauce** is strictly zero-login.
   - Run `npm run build` and `npm run lint` to confirm zero build or type errors.

3. **Commit and Push Your Branch:**

```bash
git add .
git commit -m "Add <concise feature description>"
git push -u origin feature/<descriptive-feature-name>
```

4. **Open a Pull Request:**
   - Open a Pull Request against `main` on [https://github.com/levensailor/weaksauce](https://github.com/levensailor/weaksauce).
   - In the Pull Request description, clearly explain **why this change should be added to the repository**, how it benefits the 3-piece home recording rock band / engineer-singer workflow, which open-source DSP libraries it uses, and how to test it.
