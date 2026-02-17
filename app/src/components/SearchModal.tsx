import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface SearchModalProps {
  onClose: () => void;
  onSelectChannel: (channelId: Id<"channels">) => void;
}

export function SearchModal({ onClose, onSelectChannel }: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useQuery(
    api.messages.search,
    searchQuery.trim() ? { query: searchQuery } : "skip"
  );

  const handleResultClick = (channelId: Id<"channels">) => {
    onSelectChannel(channelId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Search Messages</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for messages..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {!searchQuery.trim() ? (
            <p className="text-gray-500 text-center py-8">
              Enter a search term to find messages
            </p>
          ) : searchResults === undefined ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No messages found for "{searchQuery}"
            </p>
          ) : (
            <div className="space-y-4">
              {searchResults.map((message: any) => (
                <div
                  key={message._id}
                  onClick={() => handleResultClick(message.channelId)}
                  className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
                      {message.author.avatarUrl ? (
                        <img
                          src={message.author.avatarUrl}
                          alt={message.author.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                          {message.author.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {message.author.name}
                        </span>
                        <span className="text-sm text-gray-500">
                          in #{message.channelName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(message._creationTime).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-800 text-sm break-words">
                    {message.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
