import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ChannelSidebar } from "./ChannelSidebar";
import { MessageArea } from "./MessageArea";
import { ProfileModal } from "./ProfileModal";
import { SearchModal } from "./SearchModal";
import { SignOutButton } from "../SignOutButton";

export function ChatApp() {
  const [selectedChannelId, setSelectedChannelId] = useState<Id<"channels"> | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const channels = useQuery(api.channels.list);

  // Auto-select first channel
  useEffect(() => {
    if (channels && channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0]._id);
    }
  }, [channels, selectedChannelId]);

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="h-16 bg-purple-600 text-white flex items-center justify-between px-4 shadow-sm">
        <h1 className="text-xl font-bold">Slack Clone</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSearch(true)}
            className="px-3 py-1 bg-purple-500 hover:bg-purple-400 rounded text-sm transition-colors"
          >
            Search Messages
          </button>
          <button
            onClick={() => setShowProfile(true)}
            className="px-3 py-1 bg-purple-500 hover:bg-purple-400 rounded text-sm transition-colors"
          >
            Edit Profile
          </button>
          <SignOutButton />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ChannelSidebar
          selectedChannelId={selectedChannelId}
          onSelectChannel={setSelectedChannelId}
        />
        <MessageArea channelId={selectedChannelId} />
      </div>

      {/* Modals */}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}
      {showSearch && (
        <SearchModal 
          onClose={() => setShowSearch(false)}
          onSelectChannel={setSelectedChannelId}
        />
      )}
    </div>
  );
}
