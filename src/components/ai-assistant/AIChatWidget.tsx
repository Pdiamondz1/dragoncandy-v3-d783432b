import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { AIMessageBubble } from './AIMessageBubble';
import { AITypingIndicator } from './AITypingIndicator';
import { cn } from '@/lib/utils';

interface AIChatWidgetProps {
  userRole: string;
}

const BUTTON_SIZE = 56;          // w-14 h-14 — minimum tap target
const BOTTOM_CLEARANCE = 96;     // bottom-24 — never overlaps bottom nav
const STORAGE_KEY = 'donny-widget-position';
const DRAG_THRESHOLD = 4;        // pixels before a touch/click is treated as a drag

const getRoleGreeting = (role: string): string => {
  switch (role) {
    case 'business_client':
      return "Hey there! I'm Donny, your Restaurant Assistant. I can help you create campaigns, find creators, manage promotions, and more. What would you like to do?";
    case 'content_creator':
      return "Hey! I'm Donny, your Creator Assistant. I can help you find campaigns, manage projects, optimize your profile, and more. How can I help?";
    case 'brand':
      return "Hello! I'm Donny, your Brand Assistant. I can help you discover sponsorship opportunities, find creators, and manage partnerships. What are you looking for?";
    default:
      return "Hi! I'm Donny, your DragonCandy Assistant. How can I help you today?";
  }
};

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function constrainPos(x: number, y: number) {
  return {
    x: clamp(x, 0, window.innerWidth - BUTTON_SIZE),
    y: clamp(y, 0, window.innerHeight - BUTTON_SIZE - BOTTOM_CLEARANCE),
  };
}

function getDefaultPos() {
  return {
    x: window.innerWidth - BUTTON_SIZE - 16,   // bottom-right, 16px from edge
    y: window.innerHeight - BUTTON_SIZE - BOTTOM_CLEARANCE,
  };
}

export const AIChatWidget: React.FC<AIChatWidgetProps> = ({ userRole }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDropping, setIsDropping] = useState(false);

  const { messages, isLoading, error, sendMessage, clearChat } = useAIAssistant({ userRole });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });

  // Keep posRef in sync with pos state (used by drag handlers to avoid stale closures)
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Initialize position from localStorage or default to bottom-right
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPos(constrainPos(parsed.x, parsed.y));
        return;
      }
    } catch {}
    setPos(getDefaultPos());
  }, []);

  // Re-clamp position when window is resized
  useEffect(() => {
    const onResize = () => {
      setPos(prev => prev ? constrainPos(prev.x, prev.y) : getDefaultPos());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-scroll messages to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  // ── Drag logic ─────────────────────────────────────────────────────────────

  const startDrag = (clientX: number, clientY: number) => {
    isDragging.current = true;
    hasDragged.current = false;
    dragStart.current = { x: clientX, y: clientY };
    const cur = posRef.current;
    dragOffset.current = {
      x: clientX - (cur?.x ?? 0),
      y: clientY - (cur?.y ?? 0),
    };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = Math.abs(clientX - dragStart.current.x);
    const dy = Math.abs(clientY - dragStart.current.y);
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) hasDragged.current = true;
    setPos(constrainPos(
      clientX - dragOffset.current.x,
      clientY - dragOffset.current.y,
    ));
  };

  const endDrag = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDropping(true);
    // Save final position to localStorage
    const final = posRef.current;
    if (final) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(final)); } catch {}
    }
    setTimeout(() => setIsDropping(false), 150);
  };

  // Mouse drag (desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => moveDrag(ev.clientX, ev.clientY);
    const onUp = () => {
      endDrag();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Touch drag (mobile) — touch-action: none prevents page scroll during drag
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  };
  const handleTouchEnd = () => endDrag();

  // Only toggle open/close if the user tapped (not dragged)
  const handleClick = () => {
    if (!hasDragged.current) setIsOpen(o => !o);
  };

  // ── Chat form ───────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Don't render until position is initialized (avoids flash at wrong position)
  if (!pos) return null;

  // ── Chat panel position: appears above the button, clamped to viewport ─────
  const PANEL_W = Math.min(380, window.innerWidth - 32);
  const PANEL_H = Math.min(500, window.innerHeight - 150);
  let panelLeft = pos.x;
  let panelTop = pos.y - PANEL_H - 8;
  // Clamp panel horizontally
  if (panelLeft + PANEL_W > window.innerWidth - 8) panelLeft = window.innerWidth - PANEL_W - 8;
  if (panelLeft < 8) panelLeft = 8;
  // If panel goes above viewport, show it below the button instead
  if (panelTop < 8) panelTop = pos.y + BUTTON_SIZE + 8;

  return (
    <>
      {/* Floating Draggable Button */}
      <button
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          touchAction: 'none',
          transition: isDropping ? 'left 150ms ease-out, top 150ms ease-out' : 'none',
          zIndex: 50,
        }}
        className={cn(
          "rounded-full shadow-lg select-none cursor-grab active:cursor-grabbing",
          "bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700",
          "flex items-center justify-center",
          isOpen && "rotate-180"
        )}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white pointer-events-none" />
        ) : (
          <Sparkles className="w-6 h-6 text-white pointer-events-none" />
        )}
      </button>

      {/* Chat Panel — positioned relative to button, clamped to viewport */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            left: panelLeft,
            top: panelTop,
            width: PANEL_W,
            height: PANEL_H,
            zIndex: 50,
          }}
          className={cn(
            "bg-background border border-border rounded-2xl shadow-2xl",
            "flex flex-col overflow-hidden",
            "animate-in slide-in-from-bottom-5 fade-in duration-300"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-pink-500/10 to-purple-600/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">Donny</h3>
                <p className="text-xs text-muted-foreground">Your AI Assistant</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="space-y-4">
                <AIMessageBubble role="assistant" content={getRoleGreeting(userRole)} />
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <AIMessageBubble key={index} role={message.role} content={message.content} />
                ))}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <AITypingIndicator />
                )}
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                disabled={isLoading}
                className="flex-1 bg-muted/50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
