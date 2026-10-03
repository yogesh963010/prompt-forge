import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft, Bot, User } from "lucide-react";

interface ChildAssistant {
  id: string;
  name: string;
  description: string;
  parentId: string;
}

interface ParentAssistant {
  id: string;
  name: string;
  description: string;
  children: ChildAssistant[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const mockAssistants: ParentAssistant[] = [
  {
    id: "bde-outreach",
    name: "BDE Client Outreach Assistant",
    description: "Manages the complete client outreach workflow.",
    children: [
      {
        id: "initial-outreach",
        name: "Initial Outreach",
        description: "Creates the first personalized client message.",
        parentId: "bde-outreach",
      },
      {
        id: "first-follow-up",
        name: "First Follow-Up",
        description: "Follows up after initial contact.",
        parentId: "bde-outreach",
      },
      {
        id: "value-follow-up",
        name: "Value-Based Follow-Up",
        description: "Sends value-driven follow-ups.",
        parentId: "bde-outreach",
      },
      {
        id: "client-reply",
        name: "Client Reply Assistant",
        description: "Drafts responses to client replies.",
        parentId: "bde-outreach",
      },
    ],
  },
];

export function AssistantsWorkspace() {
  const [selectedParent, setSelectedParent] = useState<ParentAssistant | null>(null);
  const [selectedChild, setSelectedChild] = useState<ChildAssistant | null>(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "How can I help you today?",
      timestamp: new Date().toLocaleTimeString(),
    }
  ]);

  const handleSendMessage = () => {
    if (!input.trim()) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput("");

    // Mock assistant response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "This is a mock response from the assistant.",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }, 1000);
  };

  if (selectedChild) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-border/60 bg-surface-glass px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedChild(null)} className="-ml-2 mb-2 text-muted-foreground">
            <ArrowLeft className="mr-2 size-4" />
            Back to {selectedParent?.name}
          </Button>
          <h2 className="text-xl font-semibold">{selectedChild.name}</h2>
          <p className="text-sm text-muted-foreground">{selectedChild.description}</p>
        </header>
        <ChatArea messages={messages} input={input} setInput={setInput} onSend={handleSendMessage} />
      </div>
    );
  }

  if (selectedParent) {
    return (
      <div className="flex h-[calc(100vh-60px)] flex-col md:flex-row">
        {/* Sidebar for Child Assistants */}
        <aside className="w-full border-r border-border/60 bg-muted/20 md:w-64 md:shrink-0 flex flex-col">
          <div className="p-4 border-b border-border/60">
            <Button variant="ghost" size="sm" onClick={() => setSelectedParent(null)} className="-ml-2 mb-2 text-muted-foreground w-full justify-start">
              <ArrowLeft className="mr-2 size-4" />
              Back to Assistants
            </Button>
            <h3 className="font-medium">{selectedParent.name}</h3>
            <p className="text-xs text-muted-foreground">{selectedParent.description}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Child Assistants</div>
            {selectedParent.children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChild(child)}
                className="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <div className="font-medium">{child.name}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Parent Assistant Chat */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="border-b border-border/60 bg-surface-glass px-4 py-3 flex-shrink-0">
            <h2 className="text-lg font-medium">Chat with {selectedParent.name}</h2>
          </header>
          <ChatArea messages={messages} input={input} setInput={setInput} onSend={handleSendMessage} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Assistants</h1>
        <p className="text-sm text-muted-foreground">Select a parent assistant to begin.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockAssistants.map((assistant) => (
          <button
            key={assistant.id}
            onClick={() => setSelectedParent(assistant)}
            className="flex flex-col items-start rounded-xl border border-border/60 bg-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Bot className="size-5" />
              </div>
              <h3 className="font-medium">{assistant.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{assistant.description}</p>
            <div className="mt-auto text-xs font-medium text-primary flex items-center gap-1">
              {assistant.children.length} Child Assistants
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatArea({ messages, input, setInput, onSend }: {
  messages: ChatMessage[];
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="flex max-w-[80%] gap-3">
              {msg.role === "assistant" && (
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
              )}
              <div className={`rounded-2xl px-4 py-2 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <div className={`mt-1 text-[10px] ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {msg.timestamp}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <User className="size-4" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-full border border-border/60 bg-background pl-4 pr-12 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            className="absolute right-1.5 size-8 rounded-full"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
