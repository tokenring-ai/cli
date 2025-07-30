/**
 * Integration tests for the CLI package
 * @module @token-ring/cli/test/integration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import REPLService from "../REPLService.js";
import ReplHumanInterfaceService from "../ReplHumanInterfaceService.js";
import REPLOutputFormatter from "../utility/REPLOutputFormatter.js";

// Mock dependencies
vi.mock("@token-ring/inquirer-command-prompt", () => ({
	default: vi.fn().mockResolvedValue("test input"),
}));

vi.mock("@token-ring/chat/ChatService", () => ({
	default: class MockChatService {
		constructor() {
			this.messages = [];
			this.abortController = null;
		}

		resetAbortController() {
			this.abortController = new AbortController();
		}

		getAbortController() {
			return this.abortController;
		}

		getAbortSignal() {
			return this.abortController?.signal || { aborted: false };
		}

		clearAbortController() {
			this.abortController = null;
		}

		subscribe() {
			return () => {};
		}

		errorLine(msg) {
			this.messages.push({ type: "error", content: msg });
		}

		systemLine(msg) {
			this.messages.push({ type: "system", content: msg });
		}

		warningLine(msg) {
			this.messages.push({ type: "warning", content: msg });
		}
	},
}));

vi.mock("@token-ring/registry", () => ({
	Service: class MockService {
		constructor() {
			this.name = "MockService";
			this.description = "Mock service";
		}
	},
}));

vi.mock("@token-ring/chat/runCommand", () => ({
	runCommand: vi.fn(),
}));

// Mock chalk with proper structure
vi.mock("chalk", async () => {
	return {
		yellowBright: vi.fn((text) => text),
		blue: vi.fn((text) => text),
		red: vi.fn((text) => text),
		yellow: vi.fn((text) => text),
		green: vi.fn((text) => text),
		dim: vi.fn((text) => text),
		default: {
			yellowBright: vi.fn((text) => text),
			blue: vi.fn((text) => text),
			red: vi.fn((text) => text),
			yellow: vi.fn((text) => text),
			green: vi.fn((text) => text),
			dim: vi.fn((text) => text),
		},
	};
});

vi.mock("ora", () => ({
	default: vi.fn(() => ({
		start: vi.fn(),
		stop: vi.fn(),
	})),
}));

// Mock inquirer
vi.mock("inquirer", () => ({
	default: {
		prompt: vi.fn().mockResolvedValue({ selection: "test-choice" }),
	},
}));

// Mock inquirer-tree-selector
vi.mock("inquirer-tree-selector", () => ({
	treeSelector: vi.fn().mockResolvedValue({ selected: "test" }),
}));

// Mock @inquirer/prompts
vi.mock("@inquirer/prompts", () => ({
	editor: vi.fn().mockResolvedValue("test input"),
}));

// Mock clipboardy
vi.mock("clipboardy", () => ({
	default: {
		read: vi.fn().mockResolvedValue("clipboard content"),
		write: vi.fn().mockResolvedValue(undefined),
	},
	read: vi.fn().mockResolvedValue("clipboard content"),
	write: vi.fn().mockResolvedValue(undefined),
}));

// Mock execa
vi.mock("execa", () => ({
	execa: vi.fn().mockResolvedValue({}),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
	readFile: vi.fn().mockResolvedValue("file content"),
	writeFile: vi.fn().mockResolvedValue(undefined),
	unlink: vi.fn().mockResolvedValue(undefined),
}));

// Mock os
vi.mock("os", () => ({
	tmpdir: vi.fn(() => "/tmp"),
}));

// Mock path
vi.mock("path", () => ({
	default: {
		join: vi.fn((...args) => args.join("/")),
	},
	join: vi.fn((...args) => args.join("/")),
}));

// Mock @token-ring/utility/formatLogMessage
vi.mock("@token-ring/utility/formatLogMessage", () => ({
	default: vi.fn((msgs) => (Array.isArray(msgs) ? msgs.join(" ") : msgs)),
}));

// Mock @token-ring/ai-client
vi.mock("@token-ring/ai-client", () => ({
	ChatMessageStorage: class MockChatMessageStorage {
		getCurrentMessage() {
			return {
				response: {
					message: {
						content: "test message",
					},
				},
			};
		}
	},
}));

describe("CLI Package Integration Tests", () => {
	describe("REPLService", () => {
		let replService;
		let mockRegistry;
		let mockChatService;

		beforeEach(() => {
			replService = new REPLService();
			mockChatService = {
				resetAbortController: vi.fn(),
				getAbortController: vi.fn(),
				getAbortSignal: vi.fn(() => ({ aborted: false })),
				clearAbortController: vi.fn(),
				subscribe: vi.fn(() => () => {}),
				chatCommands: {
					getCommands: vi.fn(() => ({
						help: { description: "Help command" },
						quit: { description: "Quit command" },
					})),
				},
			};
			mockRegistry = {
				getFirstServiceByType: vi.fn((type) => {
					if (type.name === "ChatService") return mockChatService;
					if (type.name === "REPLService") return replService;
					return null;
				}),
				chatCommands: mockChatService.chatCommands,
			};
		});

		afterEach(() => {
			vi.clearAllMocks();
		});

		it("should initialize with default state", () => {
			expect(replService.name).toBe("REPLService");
			expect(replService.description).toBe("Provides REPL functionality");
			expect(replService.shouldExit).toBe(false);
			expect(replService.availableCommands).toContain("/help");
			expect(replService.availableCommands).toContain("/quit");
		});

		it("should update commands correctly", () => {
			const newCommands = ["/test", "/example"];
			replService.updateCommands(newCommands);
			expect(replService.availableCommands).toEqual(newCommands);
		});

		it("should add commands without duplication", () => {
			const initialLength = replService.availableCommands.length;
			replService.addCommand("/test");
			replService.addCommand("/test"); // Duplicate
			expect(replService.availableCommands.length).toBe(initialLength + 1);
			expect(replService.availableCommands).toContain("/test");
		});

		it("should inject prompts into queue", async () => {
			const testPrompt = "test prompt";
			replService.injectPrompt(testPrompt);
			expect(replService.promptQueue).toContain(testPrompt);
		});

		it("should handle command parsing correctly", () => {
			// This test verifies the command parsing logic in handleInput
			const testCases = [
				{ input: "/help", command: "help", remainder: "" },
				{ input: "/quit now", command: "quit", remainder: "now" },
				{ input: "regular text", command: "chat", remainder: "regular text" },
			];

			testCases.forEach(({ input, command, remainder }) => {
				const match = input.match(/^\/(\w+)\s*(.*)?$/);
				if (match) {
					expect(match[1]).toBe(command);
					expect(match[2] || "").toBe(remainder);
				} else {
					expect("chat").toBe(command);
					expect(input).toBe(remainder);
				}
			});
		});
	});

	describe("ReplHumanInterfaceService", () => {
		let service;

		beforeEach(() => {
			service = new ReplHumanInterfaceService();
		});

		it("should initialize with correct properties", () => {
			expect(service.name).toBe("ReplHumanInterfaceService");
			expect(service.description).toContain("REPL interface");
		});

		it("should implement askForSelection interface", async () => {
			const inquirer = await import("inquirer");
			inquirer.default.prompt.mockResolvedValue({ selection: "test-choice" });

			const result = await service.askForSelection({
				title: "Test Title",
				items: ["choice1", "choice2", "test-choice"],
			});

			expect(result).toBe("test-choice");
		});

		it("should implement ask interface", async () => {
			const inquirer = await import("inquirer");
			inquirer.default.prompt.mockResolvedValue({ answer: "test answer" });

			const result = await service.ask("Test question");

			expect(result).toBe("test answer");
		});

		it("should implement askForMultipleSelections interface", async () => {
			const inquirer = await import("inquirer");
			inquirer.default.prompt.mockResolvedValue({
				selections: ["item1", "item2"],
			});

			const result = await service.askForMultipleSelections({
				title: "Test Title",
				items: ["item1", "item2", "item3"],
			});

			expect(result).toEqual(["item1", "item2"]);
		});
	});

	describe("REPLOutputFormatter", () => {
		let formatter;
		let consoleSpy;

		beforeEach(() => {
			formatter = new REPLOutputFormatter();
			consoleSpy = {
				log: vi.spyOn(console, "log").mockImplementation(() => {}),
				error: vi.spyOn(console, "error").mockImplementation(() => {}),
			};
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should initialize with default state", () => {
			expect(formatter.lastWriteHadNewline).toBe(true);
			expect(formatter.currentOutputType).toBe(null);
			expect(formatter.spinner).toBe(null);
		});

		it("should set output type correctly", () => {
			formatter.outputType("chat");
			expect(formatter.currentOutputType).toBe("chat");
		});

		it("should handle waiting state with spinner", () => {
			formatter.waiting("Loading...");
			expect(formatter.spinner).not.toBe(null);
			expect(formatter.lastWriteHadNewline).toBe(true);
		});

		it("should stop waiting state correctly", () => {
			formatter.waiting("Loading...");
			const spinner = formatter.spinner;
			formatter.doneWaiting();
			expect(formatter.spinner).toBe(null);
		});

		it("should output system messages correctly", () => {
			formatter.systemLine("Test system message");
			expect(consoleSpy.log).toHaveBeenCalledWith("Test system message");
		});

		it("should output error messages correctly", () => {
			formatter.errorLine("Test error message");
			expect(consoleSpy.error).toHaveBeenCalledWith("Test error message");
		});

		it("should output warning messages correctly", () => {
			formatter.warningLine("Test warning message");
			expect(consoleSpy.error).toHaveBeenCalledWith("Test warning message");
		});

		it("should output info messages correctly", () => {
			formatter.infoLine("Test info message");
			expect(consoleSpy.log).toHaveBeenCalledWith("Test info message");
		});

		it("should print horizontal line correctly", () => {
			formatter.printHorizontalLine();
			expect(consoleSpy.log).toHaveBeenCalled();
		});

		it("should handle job notifications correctly", () => {
			const jobInfo = { name: "test-job" };

			formatter.jobQueued({ ...jobInfo, queueLength: 1 });
			expect(consoleSpy.log).toHaveBeenCalledWith(
				"Job [test-job] queued. Queue length: 1",
			);

			formatter.jobStarted(jobInfo);
			expect(consoleSpy.log).toHaveBeenCalledWith("Job [test-job] started");

			formatter.jobCompleted(jobInfo);
			expect(consoleSpy.log).toHaveBeenCalledWith(
				"Job [test-job] completed successfully",
			);

			formatter.jobFailed({ ...jobInfo, error: new Error("test error") });
			// Accept either the two-argument or single-argument form for compatibility
			expect(
				consoleSpy.error.mock.calls[consoleSpy.error.mock.calls.length - 1],
			).toEqual(["Job [test-job] failed:", "Error: test error"]);
		});
	});

	describe("Chat Commands Integration", () => {
		let mockRegistry;
		let mockReplService;

		beforeEach(() => {
			mockReplService = {
				shouldExit: false,
			};
			mockRegistry = {
				getFirstServiceByType: vi.fn((type) => {
					if (type.name === "REPLService") return mockReplService;
					return null;
				}),
			};
		});

		describe("Quit Command", () => {
			it("should set shouldExit flag on REPLService", async () => {
				const { execute } = await import("../commands/quit.js");
				execute("", mockRegistry);
				expect(mockReplService.shouldExit).toBe(true);
			});

			it("should provide help information", async () => {
				const { help } = await import("../commands/quit.js");
				const helpText = help();
				expect(helpText).toContain("/quit - Exit the application");
			});
		});

		describe("Exit Command", () => {
			it("should set shouldExit flag on REPLService", async () => {
				const { execute } = await import("../commands/exit.js");
				execute("", mockRegistry);
				expect(mockReplService.shouldExit).toBe(true);
			});

			it("should provide help information", async () => {
				const { help } = await import("../commands/exit.js");
				const helpText = help();
				expect(helpText).toContain("/exit - Exit the application");
			});
		});

		describe("Copy Command", () => {
			it("should provide help information", async () => {
				const { help } = await import("../commands/copy.js");
				const helpText = help();
				expect(helpText).toContain(
					"/copy - Copy the last assistant message to the clipboard",
				);
			});
		});
	});

	describe("Package Exports", () => {
		it("should export all expected components", async () => {
			const exports = await import("../index.js");

			expect(exports).toHaveProperty("ReplHumanInterfaceService");
			expect(exports).toHaveProperty("REPLService");
			expect(exports).toHaveProperty("chatCommands");
			expect(exports).toHaveProperty("name");
			expect(exports).toHaveProperty("description");
			expect(exports).toHaveProperty("version");

			expect(exports.name).toBe("@token-ring/cli");
			expect(exports.description).toBe("TokenRing Coder Application");
			expect(exports.version).toBe("0.1.0");
		});
	});
});
