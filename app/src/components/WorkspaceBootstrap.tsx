import { useMutation, useQuery } from "convex/react";
import { ReactNode, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

interface WorkspaceBootstrapProps {
  children: ReactNode;
}

export function WorkspaceBootstrap({ children }: WorkspaceBootstrapProps) {
  const workspace = useQuery(api.workspaces.myWorkspace);
  const ensureForCurrentUser = useMutation(api.workspaces.ensureForCurrentUser);

  const [attempted, setAttempted] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspace !== null || workspace === undefined || attempted) {
      return;
    }

    setAttempted(true);
    setSettingUp(true);
    setError(null);

    void ensureForCurrentUser({})
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to set up workspace");
      })
      .finally(() => {
        setSettingUp(false);
      });
  }, [workspace, attempted, ensureForCurrentUser]);

  if (workspace === undefined || workspace === null || settingUp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm w-full max-w-md text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Setting up your workspace</h2>
          <p className="text-gray-600 mb-4">
            Preparing ChatWave for your account...
          </p>
          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setAttempted(false);
                  setError(null);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Retry setup
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
