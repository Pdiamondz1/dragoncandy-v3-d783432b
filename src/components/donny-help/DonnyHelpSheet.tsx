import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "@/lib/motion";
import { X, ThumbsUp, ThumbsDown, Send, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDonnyHelp } from "@/hooks/useDonnyHelp";
import { getSuggestionsForPage } from "./helpSuggestions";
import donnyEmblem from "@/assets/donny-emblem.png";

interface DonnyHelpSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DonnyHelpSheet({ isOpen, onClose }: DonnyHelpSheetProps) {
  const { messages, isLoading, sendQuestion, rateAnswer, currentPage } =
    useDonnyHelp();
  const [input, setInput] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const suggestions = getSuggestionsForPage(currentPage);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendQuestion(input.trim());
    setInput("");
  };

  const handleChipTap = (question: string) => {
    sendQuestion(question);
  };

  const handleThumbsDown = (logId: string) => {
    if (feedbackOpen === logId) {
      setFeedbackOpen(null);
    } else {
      setFeedbackOpen(logId);
      setFeedbackText("");
    }
    rateAnswer(logId, -1);
  };

  const submitFeedback = (logId: string) => {
    if (feedbackText.trim()) {
      rateAnswer(logId, -1, feedbackText.trim());
    }
    setFeedbackOpen(null);
    setFeedbackText("");
  };

  const pageLabel =
    currentPage
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Page";

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - mobile only */}
      <div
        className="fixed inset-0 z-[70] bg-black/30 lg:bg-black/10"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed z-[71] bottom-0 left-0 right-0 h-[75dvh] rounded-t-2xl bg-white shadow-2xl flex flex-col lg:bottom-6 lg:right-6 lg:left-auto lg:top-auto lg:w-96 lg:h-[540px] lg:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-dc-teal/10">
            <img
              src={donnyEmblem}
              alt=""
              className="w-full h-full object-cover scale-[1.35]"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dc-dark">Ask Donny</p>
            <p className="text-xs text-gray-500 truncate">
              On: {pageLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100"
            aria-label="Close help"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500 mb-4">
                Ask me anything about this page
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleChipTap(s.question)}
                    className="px-3 py-1.5 rounded-full border border-dc-teal/40 text-xs font-medium text-dc-teal hover:bg-dc-teal/5 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                  msg.role === "user"
                    ? "ml-auto bg-dc-teal text-white rounded-br-md"
                    : "mr-auto bg-gray-100 text-dc-dark rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>

              {/* Suggested actions */}
              {msg.role === "assistant" &&
                msg.suggestedActions &&
                msg.suggestedActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 ml-1">
                    {msg.suggestedActions.map((action) => (
                      <button
                        key={action.route}
                        onClick={() => {
                          navigate(action.route);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-dc-teal/10 text-xs font-medium text-dc-teal hover:bg-dc-teal/20"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

              {/* Feedback buttons */}
              {msg.role === "assistant" && msg.logId && (
                <div className="flex items-center gap-1 mt-1 ml-1">
                  <button
                    onClick={() => rateAnswer(msg.logId!, 1)}
                    className={`p-1 rounded ${
                      msg.rating === 1
                        ? "text-dc-teal"
                        : "text-gray-300 hover:text-gray-500"
                    }`}
                    aria-label="Helpful"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleThumbsDown(msg.logId!)}
                    className={`p-1 rounded ${
                      msg.rating === -1
                        ? "text-red-400"
                        : "text-gray-300 hover:text-gray-500"
                    }`}
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Feedback text field */}
              {feedbackOpen === msg.logId && (
                <div className="ml-1 mt-1 flex gap-1.5">
                  <input
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="What was wrong?"
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-dc-teal"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitFeedback(msg.logId!);
                    }}
                  />
                  <button
                    onClick={() => submitFeedback(msg.logId!)}
                    className="text-xs text-dc-teal font-medium px-2"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="mr-auto bg-gray-100 rounded-2xl rounded-bl-md px-3 py-2 max-w-[85%]">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-dc-teal rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-dc-teal rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-dc-teal rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-3 flex-shrink-0 space-y-2">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:border-dc-teal"
              disabled={isLoading}
            />
            <Button
              type="submit"
              variant="dc-primary"
              size="icon"
              className="rounded-full w-9 h-9 flex-shrink-0"
              disabled={!input.trim() || isLoading}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="flex justify-between items-center">
            <a
              href="mailto:support@dragoncandy.io"
              className="text-xs text-gray-400 hover:text-dc-teal transition-colors"
            >
              Talk to a human
            </a>
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
