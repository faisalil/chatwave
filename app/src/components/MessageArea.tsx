import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface MessageAreaProps {
  channelId: Id<"channels"> | null;
}

export function MessageArea({ channelId }: MessageAreaProps) {
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useQuery(
    api.messages.list, 
    channelId ? { channelId } : "skip"
  );
  const channel = useQuery(
    api.channels.get,
    channelId ? { channelId } : "skip"
  );
  const sendMessage = useMutation(api.messages.send);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !channelId) return;

    try {
      await sendMessage({ channelId, content: messageText });
      setMessageText("");
    } catch (error) {
      toast.error("Failed to send message");
    }
  };

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Select a channel to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Channel Header */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6">
        <h2 className="text-xl font-semibold">
          # {channel?.name || "Loading..."}
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages?.map((message: any) => (
          <div key={message._id} className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
              {message.author.avatarUrl ? (
                <img
                  src={message.author.avatarUrl}
                  alt={message.author.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-purple-500 flex items-center justify-center text-white font-semibold">
                  {message.author.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-semibold text-gray-900">
                  {message.author.name}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(message._creationTime).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-gray-800 break-words">{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={`Message #${channel?.name || "channel"}`}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!messageText.trim()}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
