/*****************************************************************
 * src/index.ts - AI Task Manager CLI using OpenAI + TypeScript + lowdb
 *****************************************************************/

import inquirer from "inquirer";
import chalk from "chalk";
import { JSONFilePreset, JSONFileSync } from "lowdb/node";

// Load environment variables
import "dotenv/config";

import { openai } from "./ai"; // Assuming you have an 'ai.ts' that exports 'openai'

if (!process.env.OPENAI_API_KEY) {
  console.error(chalk.red("Error: OPENAI_API_KEY not found in .env file."));
  process.exit(1);
}

// --------------------
//  1) Database Setup
// --------------------
interface Task {
  id: number;
  description: string;
  dueDate?: string;
  completed: boolean;
  category?: string;
}

interface Post {
  id: number;
  title: string;
  views: number;
}

interface DBData {
  tasks: Task[];
  posts: Post[];
}

// Create adapter and database instance
const defaultData = { tasks: [], posts: [] };
const db = await JSONFilePreset<DBData>("./db.json", defaultData);

// Read database contents; initialize if empty
await db.read();

if (!db.data) {
  db.data = defaultData;
  db.write();
}

// Helper function to get the next ID
function getNextTaskId(): number {
  const tasks = db.data?.tasks || [];
  const maxId = tasks.reduce((acc, t) => (t.id > acc ? t.id : acc), 0);
  return maxId + 1;
}

// --------------------
//  2) Prompt Design
// --------------------
const systemPrompt = `
You are a helpful task manager assistant.
You will receive user input about tasks in plain English or Spanish
You should output a JSON object with:
{
  "command": "add" or "list" or "complete" or "summary",
  "description": string (optional),
  "dueDate": string (ISO format if provided),
  "id": number (optional),
  "category": string (optional),
  "filters": { ... } (optional)
}
IMPORTANT: Output ONLY valid JSON, no additional text.
`;

// --------------------
//  3) LLM Parsing
// --------------------
async function parseUserInput(userMessage: string): Promise<any> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content?.trim() || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      console.warn(
        chalk.yellow(
          "Warning: Failed to parse JSON from LLM. Falling back to manual 'list' command."
        )
      );
      return { command: "list" };
    }
    return parsed;
  } catch (error) {
    console.error(chalk.red("OpenAI API error:"), error);
    return { command: "list" };
  }
}

// --------------------
//  4) Command Handlers
// --------------------
function handleCommand(parsed: any): string {
  const command = parsed.command || "list";

  switch (command) {
    case "add":
      return handleAddCommand(parsed);
    case "complete":
      return handleCompleteCommand(parsed);
    case "list":
      return handleListCommand();
    case "summary":
      return "summary_command";
    default:
      return "Sorry, I didn’t understand that. Try again.";
  }
}

function handleAddCommand(parsed: any): string {
  const description = parsed.description || "";
  if (!description) {
    return "No description provided. Try again.";
  }

  const newTask: Task = {
    id: getNextTaskId(),
    description,
    dueDate: parsed.dueDate || undefined,
    completed: false,
    category: parsed.category || undefined,
  };

  if (!db.data) {
    db.data = { tasks: [] };
  }
  db.data.tasks.push(newTask);
  db.write();

  let msg = `Task added: "${description}"`;
  if (newTask.dueDate) {
    msg += ` (Due: ${new Date(newTask.dueDate).toLocaleString()})`;
  }
  return msg;
}

function handleCompleteCommand(parsed: any): string {
  const targetId = parsed.id;
  const targetDescription = parsed.description;
  let updated = false;

  const tasks = db.data!.tasks;

  // If an ID is provided, search by ID first
  if (targetId) {
    for (const t of tasks) {
      if (t.id === targetId) {
        t.completed = true;
        updated = true;
        break;
      }
    }
  } else if (targetDescription) {
    // Otherwise, search by description (case-insensitive)
    for (const t of tasks) {
      if (
        t.description.toLowerCase().includes(targetDescription.toLowerCase())
      ) {
        t.completed = true;
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    return "Could not find a matching task to complete.";
  }

  db.write();
  return "Task marked as completed.";
}

function handleListCommand(): string {
  const tasks = db.data!.tasks;
  if (tasks.length === 0) {
    return "You have no tasks yet.";
  }

  const lines = tasks.map((t) => {
    const status = t.completed ? "[x]" : "[ ]";
    const due = t.dueDate
      ? ` (Due: ${new Date(t.dueDate).toLocaleString()})`
      : "";
    return `${t.id}. ${status} ${t.description}${due}`;
  });

  return lines.join("\n");
}

// For generating an AI-powered summary of tasks
async function handleSummaryCommandLLM(): Promise<string> {
  const tasks = db.data!.tasks;
  if (tasks.length === 0) {
    return "You have no tasks to summarize.";
  }

  // Build a summary prompt
  const summaryPrompt = `
Here is the current task list:
${JSON.stringify(tasks, null, 2)}
Please provide a short bullet list summary.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You summarize tasks in a concise bullet list.",
        },
        { role: "user", content: summaryPrompt },
      ],
      temperature: 0.2,
    });
    const summary = response.choices[0].message?.content?.trim();
    return summary || "No summary available.";
  } catch (error) {
    console.error(chalk.red("Error summarizing tasks:"), error);
    return "Error summarizing tasks.";
  }
}

// --------------------
//  5) Main CLI Loop
// --------------------
async function mainLoop(): Promise<void> {
  console.log(chalk.blue("Welcome to your AI Task Manager!"));
  console.log(chalk.gray("Type 'exit' to quit.\n"));

  while (true) {
    const { userInput } = await inquirer.prompt<{ userInput: string }>([
      {
        type: "input",
        name: "userInput",
        message: chalk.cyan("Enter a command:"),
      },
    ]);

    if (userInput.toLowerCase() === "exit") {
      console.log(chalk.green("Goodbye!"));
      break;
    }

    // 1. Parse user input with the LLM
    const parsed = await parseUserInput(userInput);

    // 2. Check if user asked for summary
    if (parsed.command === "summary") {
      console.log(chalk.yellow("Generating summary..."));
      const summary = await handleSummaryCommandLLM();
      console.log(chalk.green(summary));
      continue;
    }

    // 3. Otherwise, handle the command
    const result = handleCommand(parsed);

    // If the command was "summary_command", we call the summary function
    if (result === "summary_command") {
      console.log(chalk.yellow("Generating summary..."));
      const summary = await handleSummaryCommandLLM();
      console.log(chalk.green(summary));
    } else {
      console.log(chalk.green(result));
    }
  }
}

// Start the CLI
mainLoop().catch((error) => {
  console.error(chalk.red("Unexpected error:"), error);
});
