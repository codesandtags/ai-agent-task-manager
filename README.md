# AI Agent Task Manager

A simple CLI-based AI Agent that uses OpenAI’s API to interpret and manage tasks in natural language.

## Features

- **Add tasks** by describing them in normal speech (e.g., "Add a task to buy groceries tomorrow").
- **Complete tasks** by referencing an ID or part of the description (e.g., "Complete the groceries task").
- **List tasks** to see current tasks with their status and due dates.
- **Summarize tasks** using the LLM to generate a concise bullet list summary.

## Getting Started

1. **Clone or download** this repository.
2. **Install dependencies**:
   ```bash
   npm install
   ```

## Examples

```bash
Welcome to your AI Task Manager!
Type 'exit' to quit.

Enter a command:
```

**Adding a task:**

```bash
Add a task to buy groceries at 5 PM tomorrow
```

**Listing tasks**

```bash
List tasks
```

**Marking a task as complete**

```bash
Mark "buy groceries" as complete
```
