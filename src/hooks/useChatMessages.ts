import { useState, useCallback } from "react";
import { ChatMessage } from "@/types/ct";

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const addMessage = useCallback(
    (msg: Omit<ChatMessage, "id" | "timestamp">) => {
      const newMsg: ChatMessage = {
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMsg]);
      return newMsg.id;
    },
    [],
  );

  const updateMessage = useCallback(
    (id: string, update: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...update } : m)),
      );
    },
    [],
  );

  // 숫자 입력 → 마지막 options 메시지의 해당 옵션 value로 변환
  const resolveNumberInput = useCallback(
    (text: string): string => {
      const numMatch = text.match(/^(\d)$/);
      if (numMatch) {
        const lastOptions = [...messages]
          .reverse()
          .find((m) => m.type === "options" && m.options?.length);
        if (lastOptions?.options) {
          const idx = parseInt(numMatch[1]) - 1;
          if (idx >= 0 && idx < lastOptions.options.length) {
            return lastOptions.options[idx].value;
          }
        }
      }
      return text;
    },
    [messages],
  );

  return { messages, addMessage, updateMessage, resolveNumberInput };
}
