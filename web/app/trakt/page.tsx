"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, CardBody, Chip, Input, Spinner } from "@nextui-org/react";
import { api } from "@/lib/api";
import type { AnimeEntry, TraktAuthStatus, TraktDeviceCodeResponse, TraktList, TraktTestResult } from "@/types/api";

type EpisodeType = TraktList["episode_type"];

interface Toast {
  msg: string;
  type: "success" | "error";
}

const EPISODE_TYPES: EpisodeType[] = [
  "filler",
  "manga canon",
  "anime canon",
  "mixed canon/filler",
];

const EPISODE_TYPE_LABELS: Record<EpisodeType, string> = {
  filler: "Filler",
  "manga canon": "Manga Canon",
  "anime canon": "Anime Canon",
  "mixed canon/filler": "Mixed Canon/Filler",
};

const CHIP_COLOR: Record<EpisodeType, "warning" | "primary" | "success" | "secondary"> = {
  filler: "warning",
  "manga canon": "primary",
  "anime canon": "success",
  "mixed canon/filler": "secondary",
};

function DiagRow({ ok, label, value, warn }: { ok: boolean; label: string; value: string; warn?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={ok ? "text-green-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
      <span className="text-zinc-400 w-36 shrink-0">{label}</span>
      <span className={ok ? "text-zinc-200" : "text-red-300"}>{value}</span>
      {warn && <span className="text-yellow-400">{warn}</span>}
    </div>
  );
}

export default function TraktListsPage() {
  const [lists, setLists] = useState<TraktList[]>([]);
  const [traktUsername, setTraktUsername] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<AnimeEntry[]>([]);
  const [plexShows, setPlexShows] = useState<string[]>([]);
  const [plexError, setPlexError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authStatus, setAuthStatus] = useState<TraktAuthStatus | null>(null);

  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<TraktTestResult | null>(null);

  // Reconnect modal state
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [rcClientId, setRcClientId] = useState("");
  const [rcClientSecret, setRcClientSecret] = useState("");
  const [rcUsername, setRcUsername] = useState("");
  const [rcStep, setRcStep] = useState<"form" | "device">("form");
  const [rcDeviceInfo, setRcDeviceInfo] = useState<TraktDeviceCodeResponse | null>(null);
  const [rcPolling, setRcPolling] = useState(false);
  const [rcSuccess, setRcSuccess] = useState(false);
  const [rcError, setRcError] = useState<string | null>(null);
  const [rcCountdown, setRcCountdown] = useState(0);
  const [rcSaving, setRcSaving] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const [runningAnime, setRunningAnime] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [toast, setToast] = useState<Toast | null>(null);

  const syncDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [listsData, scheduleData, plexData, statusData] = await Promise.all([
        api.getTraktLists(),
        api.getAnimeSchedule(),
        api.getPlexShows(),
        api.getTraktAuthStatus().catch(() => null),
      ]);

      if (listsData.error) {
        setError(listsData.error);
        setLists([]);
      } else {
        setLists(listsData.lists);
        setTraktUsername(listsData.trakt_username ?? null);
        setError(null);
      }

      setSchedule(scheduleData.anime);

      if (plexData.error) {
        setPlexShows([]);
        setPlexError(plexData.error);
      } else {
        setPlexShows(plexData.shows);
        setPlexError(null);
      }

      setAuthStatus(statusData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!syncing) return;

    const interval = setInterval(async () => {
      try {
        const status = await api.getSyncStatus();
        if (!status.running) {
          setSyncing(false);
          setSyncDone(true);
          fetchData();
          syncDoneTimerRef.current = setTimeout(() => setSyncDone(false), 3000);
        }
      } catch {
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncing, fetchData]);

  useEffect(() => {
    if (runningAnime === null) return;

    const aflName = runningAnime;

    const interval = setInterval(async () => {
      try {
        const status = await api.getAnimeRunStatus(aflName);
        if (!status.running) {
          setRunningAnime(null);
          fetchData();
        }
      } catch {
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runningAnime, fetchData]);

  useEffect(() => {
    return () => {
      if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  function openReconnect() {
    setRcClientId(authStatus?.client_id ?? "");
    setRcClientSecret(authStatus?.client_secret ?? "");
    setRcUsername(authStatus?.username ?? "");
    setRcStep("form");
    setRcDeviceInfo(null);
    setRcPolling(false);
    setRcSuccess(false);
    setRcError(null);
    setRcCountdown(0);
    setRcSaving(false);
    setReconnectOpen(true);
  }

  function closeReconnect() {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    setReconnectOpen(false);
    if (rcSuccess) {
      setLoading(true);
      fetchData();
    }
  }

  async function handleGetDeviceCode() {
    if (!rcClientId.trim()) { setRcError("Client ID is required"); return; }
    if (!rcClientSecret.trim()) { setRcError("Client Secret is required"); return; }
    if (!rcUsername.trim()) { setRcError("Username is required"); return; }
    setRcError(null);
    try {
      const data = await api.getTraktDeviceCode(rcClientId.trim());
      setRcDeviceInfo(data);
      setRcStep("device");
      setRcCountdown(data.expires_in);

      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setRcCountdown((n) => {
          if (n <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            return 0;
          }
          return n - 1;
        });
      }, 1000);

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setRcPolling(true);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const poll = await api.pollTraktDeviceToken(data.device_code, rcClientId.trim(), rcClientSecret.trim());
          if (poll.authorized) {
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
            if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
            setRcPolling(false);
            setRcSaving(true);
            try {
              await api.updateTraktCredentials(rcClientId.trim(), rcClientSecret.trim(), rcUsername.trim());
            } catch {
              // credentials saved — non-fatal
            }
            setRcSaving(false);
            setRcSuccess(true);
            setAuthStatus((prev) => prev
              ? { ...prev, connected: true, username: rcUsername.trim(), client_id: rcClientId.trim(), client_secret: rcClientSecret.trim() }
              : prev
            );
          } else if (poll.pending === false) {
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
            setRcPolling(false);
            setRcError(poll.error ?? "Authorization failed or expired");
          }
        } catch {
          // transient error — keep polling
        }
      }, (data.interval ?? 5) * 1000);
    } catch (e: unknown) {
      setRcError(e instanceof Error ? e.message : "Failed to get device code");
    }
  }

  async function handleSync() {
    try {
      const res = await api.syncTraktCollections();
      if (res.started) {
        setSyncing(true);
        setSyncDone(false);
      } else {
        showToast(res.message ?? "Sync could not be started", "error");
      }
    } catch (e: unknown) {
      showToast(
        "Failed to start sync: " + (e instanceof Error ? e.message : String(e)),
        "error",
      );
    }
  }

  async function handleDelete(listId: number) {
    setDeletingId(listId);
    setConfirmDeleteId(null);
    try {
      await api.deleteTraktList(listId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      showToast("List deleted successfully");
    } catch (e: unknown) {
      showToast(
        "Failed to delete list: " + (e instanceof Error ? e.message : String(e)),
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreateAll(aflName: string) {
    try {
      const res = await api.triggerAnimeRun(aflName);
      if (res.started) {
        setRunningAnime(aflName);
      } else {
        showToast(res.message ?? "Could not start", "error");
      }
    } catch (e: unknown) {
      showToast("Failed: " + (e instanceof Error ? e.message : String(e)), "error");
    }
  }

  const plexShowsSet = useMemo(
    () => new Set(plexShows.map((s) => s.toLowerCase())),
    [plexShows],
  );

  const orphanedLists = useMemo(
    () => lists.filter((l) => !plexShowsSet.has(l.plex_name.toLowerCase())),
    [lists, plexShowsSet],
  );

  const unscheduledGroups = useMemo(() => {
    const scheduledSet = new Set(schedule.map((a) => a.afl_name));
    const groups = new Map<string, { plex_name: string; lists: TraktList[] }>();
    for (const list of lists) {
      if (!scheduledSet.has(list.anime_name) && plexShowsSet.has(list.plex_name.toLowerCase())) {
        if (!groups.has(list.anime_name)) {
          groups.set(list.anime_name, { plex_name: list.plex_name, lists: [] });
        }
        groups.get(list.anime_name)!.lists.push(list);
      }
    }
    return Array.from(groups.entries()).map(([anime_name, data]) => ({ anime_name, ...data }));
  }, [lists, schedule, plexShowsSet]);

  const plexAvailable = plexError === null && plexShows.length > 0;

  const q = search.toLowerCase();
  const filteredSchedule = schedule.filter(
    (a) => !q || a.display_name.toLowerCase().includes(q) || a.afl_name.toLowerCase().includes(q),
  );
  const filteredUnscheduled = unscheduledGroups.filter(
    (g) => !q || g.anime_name.toLowerCase().includes(q) || g.plex_name.toLowerCase().includes(q),
  );
  const filteredOrphaned = orphanedLists.filter(
    (l) => !q || l.name.toLowerCase().includes(q) || l.anime_name.toLowerCase().includes(q),
  );

  function findList(aflName: string, type: EpisodeType): TraktList | undefined {
    return lists.find((l) => l.anime_name === aflName && l.episode_type === type);
  }

  function traktListUrl(listName: string): string | null {
    if (!traktUsername) return null;
    const slug = listName.replace(/ /g, "-").replace(/\//g, "-");
    return `https://trakt.tv/users/${traktUsername}/lists/${slug}`;
  }

  const isTraktConfigError =
    error !== null &&
    (/not configured/i.test(error) || /auth/i.test(error));

  async function runDiagnostic() {
    setDiagRunning(true);
    setDiagResult(null);
    try {
      const result = await api.testTraktConnection();
      setDiagResult(result);
    } catch (e: unknown) {
      setDiagResult({
        config_ok: false, config_username: null, token_exists: false,
        token_has_refresh: false, token_expires_in_days: null, auth_ok: false,
        authenticated_username: null, username_match: null,
        total_lists: null, dakosys_lists: null,
        error: e instanceof Error ? e.message : "Diagnostic request failed",
      });
    } finally {
      setDiagRunning(false);
    }
  }

  function renderDeleteButton(list: TraktList) {
    const isConfirming = confirmDeleteId === list.id;
    const isDeleting = deletingId === list.id;

    return (
      <Button
        size="sm"
        variant={isConfirming ? "solid" : "flat"}
        color="danger"
        isDisabled={deletingId !== null}
        isLoading={isDeleting}
        onPress={() => {
          if (isConfirming) {
            handleDelete(list.id);
          } else {
            setConfirmDeleteId(list.id);
          }
        }}
        onBlur={() => {
          if (isConfirming) setConfirmDeleteId(null);
        }}
      >
        {isConfirming ? "Confirm?" : "Delete"}
      </Button>
    );
  }

  function renderEpisodeRow(aflName: string, type: EpisodeType) {
    const list = findList(aflName, type);

    return (
      <div
        key={type}
        className="flex items-center gap-3 py-1.5"
      >
        <span className="text-sm text-zinc-300 w-28 sm:w-40 shrink-0">
          {EPISODE_TYPE_LABELS[type]}
        </span>

        <div className="flex-1">
          {list ? (() => {
            const url = traktListUrl(list.name);
            const chip = (
              <Chip size="sm" variant="flat" color={CHIP_COLOR[type]}>
                {list.item_count} {list.item_count === 1 ? "episode" : "episodes"}
              </Chip>
            );
            return url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 group">
                {chip}
                <svg className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : chip;
          })() : (
            <span className="text-zinc-600 text-sm">No list</span>
          )}
        </div>

        <div className="w-24 flex justify-end">
          {list && renderDeleteButton(list)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-950/80 border-green-800 text-green-300"
              : "bg-red-950/80 border-red-800 text-red-300"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white">Trakt Lists</h1>
          <p className="text-zinc-400 mt-1">
            Manage Trakt.tv episode type lists for your scheduled anime
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button
            color="secondary"
            variant="flat"
            isDisabled={syncing}
            onPress={handleSync}
          >
            {syncing ? (
              <>
                <Spinner size="sm" color="current" className="mr-2" />
                Syncing...
              </>
            ) : syncDone ? (
              "\u2713 Synced!"
            ) : (
              "Sync Collections"
            )}
          </Button>

          <Button
            variant="flat"
            color="default"
            isDisabled={loading}
            onPress={() => {
              setLoading(true);
              fetchData();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Trakt connection status */}
      {authStatus !== null && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 mb-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  authStatus.connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm text-zinc-300">
                {authStatus.connected ? (
                  <>Connected as <span className="text-white font-medium">{authStatus.username || "unknown"}</span></>
                ) : (
                  <span className="text-red-400">Not connected to Trakt</span>
                )}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="flat" color="default" isLoading={diagRunning} onPress={runDiagnostic}>
                Diagnose
              </Button>
              <Button size="sm" variant="flat" color="secondary" onPress={openReconnect}>
                Reconnect
              </Button>
            </div>
          </div>
          {diagResult && (
            <div className="bg-black/30 rounded-md p-3 text-xs font-mono space-y-1">
              <DiagRow ok={diagResult.config_ok} label="Config file" value={diagResult.config_ok ? `username: ${diagResult.config_username}` : "not found"} />
              <DiagRow ok={diagResult.token_exists} label="Token file" value={diagResult.token_exists ? (diagResult.token_expires_in_days !== null ? `expires in ${diagResult.token_expires_in_days}d, refresh: ${diagResult.token_has_refresh ? "yes" : "no"}` : "present") : "not found"} />
              <DiagRow ok={diagResult.auth_ok} label="Authentication" value={diagResult.auth_ok ? "ok" : "failed"} />
              {diagResult.auth_ok && (
                <DiagRow
                  ok={diagResult.username_match !== false}
                  label="Authenticated user"
                  value={diagResult.authenticated_username ?? "unknown"}
                  warn={diagResult.username_match === false ? `(config says ${diagResult.config_username})` : undefined}
                />
              )}
              {diagResult.total_lists !== null && (
                <DiagRow
                  ok={true}
                  label="Trakt lists"
                  value={`${diagResult.total_lists} total, ${diagResult.dakosys_lists} DAKOSYS`}
                />
              )}
              {diagResult.error && (
                <p className="text-red-400 pt-1">Error: {diagResult.error}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search anime…"
          value={search}
          onValueChange={setSearch}
          variant="bordered"
          classNames={{
            inputWrapper: "bg-zinc-900 border-zinc-700",
            input: "text-white",
          }}
          startContent={
            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center h-40 items-center">
          <Spinner color="secondary" />
        </div>
      )}

      {/* Trakt config error banner */}
      {isTraktConfigError && (
        <div className="bg-yellow-950/50 border border-yellow-800 rounded-lg p-4 mb-4">
          <p className="text-yellow-400 text-sm">
            Trakt is not configured or authentication failed. Use the Diagnose button above.
          </p>
        </div>
      )}

      {/* Generic error banner (non-config) */}
      {error && !isTraktConfigError && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Summary strip */}
          {lists.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg mb-6">
              <p className="text-zinc-400">
                <span className="text-white font-semibold">{schedule.length + unscheduledGroups.length}</span> anime
                {" "}&middot;{" "}
                <span className="text-white font-semibold">{lists.length}</span> lists
              </p>
            </div>
          )}

          {/* Empty schedule */}
          {schedule.length === 0 && (
            <Card className="bg-zinc-900 border border-zinc-800">
              <CardBody className="p-6 text-center text-zinc-500">
                No anime scheduled. Add anime to your config to get started.
              </CardBody>
            </Card>
          )}

          {/* Scheduled anime cards */}
          {filteredSchedule.length > 0 && (
            <div className="space-y-4 mb-8">
              {filteredSchedule.map((anime) => (
                <Card key={anime.afl_name} className="bg-zinc-900 border border-zinc-800">
                  <CardBody className="p-5">
                    {/* Anime header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center min-w-0">
                        <span className="text-lg mr-2">🎌</span>
                        <span className="font-bold text-white">{anime.display_name}</span>
                        <span className="text-zinc-500 text-xs ml-2">{anime.afl_name}</span>
                      </div>
                      {/* Create All only appears for anime with no lists yet */}
                      {EPISODE_TYPES.every((t) => !findList(anime.afl_name, t)) && (
                        <Button
                          size="sm"
                          variant="flat"
                          color="secondary"
                          isDisabled={runningAnime !== null}
                          isLoading={runningAnime === anime.afl_name}
                          onPress={() => handleCreateAll(anime.afl_name)}
                        >
                          {runningAnime === anime.afl_name ? "Running..." : "Create All"}
                        </Button>
                      )}
                    </div>

                    {/* Episode type rows */}
                    <div className="divide-y divide-zinc-800">
                      {EPISODE_TYPES.map((type) => renderEpisodeRow(anime.afl_name, type))}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {/* Unscheduled anime section (in Plex, not in schedule) */}
          {plexAvailable && filteredUnscheduled.length > 0 && (
            <div className="mb-8">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Unscheduled Anime</h2>
                <p className="text-zinc-400 text-sm mt-1">
                  In your Plex library but not in the active schedule
                </p>
              </div>
              <div className="space-y-4">
                {filteredUnscheduled.map((group) => (
                  <Card key={group.anime_name} className="bg-zinc-900 border border-zinc-800">
                    <CardBody className="p-5">
                      <div className="flex items-center min-w-0 mb-3">
                        <span className="text-lg mr-2">🎌</span>
                        <span className="font-bold text-white">{group.plex_name}</span>
                        <span className="text-zinc-500 text-xs ml-2">{group.anime_name}</span>
                      </div>
                      <div className="divide-y divide-zinc-800">
                        {EPISODE_TYPES.map((type) => renderEpisodeRow(group.anime_name, type))}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Orphaned lists section */}
          {plexAvailable && filteredOrphaned.length > 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">Orphaned Lists</h2>
                <p className="text-zinc-400 text-sm mt-1">
                  These lists are on Trakt but the show is not in your Plex library
                </p>
              </div>

              <div className="space-y-2">
                {filteredOrphaned.map((list) => (
                  <div
                    key={list.id}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {(() => {
                        const url = traktListUrl(list.name);
                        return url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-white font-medium hover:text-violet-400 transition-colors">
                            {list.name} ↗
                          </a>
                        ) : (
                          <span className="text-sm text-white font-medium">{list.name}</span>
                        );
                      })()}
                      <Chip size="sm" variant="flat" color={CHIP_COLOR[list.episode_type]}>
                        {EPISODE_TYPE_LABELS[list.episode_type]}
                      </Chip>
                      <span className="text-zinc-500 text-xs">
                        {list.item_count} {list.item_count === 1 ? "episode" : "episodes"}
                      </span>
                    </div>

                    {renderDeleteButton(list)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plex unavailable note (orphaned detection disabled) */}
          {!plexAvailable && !loading && (
            <p className="text-zinc-600 text-sm mt-4">
              Plex library unavailable — orphaned detection disabled.
            </p>
          )}
        </>
      )}

      {/* Reconnect to Trakt modal */}
      {reconnectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            {rcSuccess ? (
              <div className="text-center py-4">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-xl font-bold text-white mb-2">Connected!</h2>
                <p className="text-zinc-400 text-sm mb-6">
                  Trakt authentication successful. Credentials saved to config.
                </p>
                <Button color="secondary" onPress={closeReconnect}>
                  Close
                </Button>
              </div>
            ) : rcStep === "form" ? (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-white">Reconnect to Trakt</h2>
                  <button
                    onClick={closeReconnect}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl leading-none"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 mb-4">
                  <Input
                    label="Client ID"
                    value={rcClientId}
                    onValueChange={setRcClientId}
                    variant="bordered"
                    classNames={{ inputWrapper: "bg-zinc-800 border-zinc-700", input: "text-white" }}
                  />
                  <Input
                    label="Client Secret"
                    type="password"
                    value={rcClientSecret}
                    onValueChange={setRcClientSecret}
                    variant="bordered"
                    classNames={{ inputWrapper: "bg-zinc-800 border-zinc-700", input: "text-white" }}
                  />
                  <Input
                    label="Trakt Username"
                    value={rcUsername}
                    onValueChange={setRcUsername}
                    variant="bordered"
                    classNames={{ inputWrapper: "bg-zinc-800 border-zinc-700", input: "text-white" }}
                  />
                </div>

                {rcError && (
                  <p className="text-red-400 text-sm mb-3">{rcError}</p>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="flat" color="default" onPress={closeReconnect}>
                    Cancel
                  </Button>
                  <Button color="secondary" onPress={handleGetDeviceCode}>
                    Get Authorization Code
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-white">Authorize on Trakt</h2>
                  <button
                    onClick={() => {
                      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
                      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                      setRcStep("form");
                      setRcPolling(false);
                      setRcDeviceInfo(null);
                    }}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl leading-none"
                    aria-label="Back"
                  >
                    ✕
                  </button>
                </div>

                <ol className="text-sm text-zinc-300 space-y-3 mb-5">
                  <li className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-violet-800 text-white text-xs flex items-center justify-center font-bold">1</span>
                    <span>
                      Visit{" "}
                      <a
                        href={rcDeviceInfo?.verification_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 hover:text-violet-300 underline"
                      >
                        {rcDeviceInfo?.verification_url}
                      </a>
                    </span>
                  </li>
                  <li className="flex gap-2 items-start">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-violet-800 text-white text-xs flex items-center justify-center font-bold">2</span>
                    <span>
                      Enter code:{" "}
                      <button
                        className="font-mono font-bold text-white bg-zinc-700 hover:bg-zinc-600 px-2 py-0.5 rounded transition-colors text-base"
                        onClick={() => navigator.clipboard.writeText(rcDeviceInfo?.user_code ?? "")}
                        title="Click to copy"
                      >
                        {rcDeviceInfo?.user_code}
                      </button>
                      <span className="text-zinc-500 text-xs ml-1">(click to copy)</span>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-violet-800 text-white text-xs flex items-center justify-center font-bold">3</span>
                    <span>Approve access in your browser, then wait here.</span>
                  </li>
                </ol>

                <div className="flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-3 mb-4">
                  {rcPolling || rcSaving ? (
                    <Spinner size="sm" color="secondary" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-zinc-600" />
                  )}
                  <span className="text-sm text-zinc-300">
                    {rcSaving
                      ? "Saving credentials…"
                      : rcPolling
                      ? "Waiting for authorization…"
                      : "Polling stopped"}
                  </span>
                  {rcCountdown > 0 && (
                    <span className="ml-auto text-xs text-zinc-500">
                      {Math.floor(rcCountdown / 60)}:{String(rcCountdown % 60).padStart(2, "0")}
                    </span>
                  )}
                </div>

                {rcError && (
                  <p className="text-red-400 text-sm mb-3">{rcError}</p>
                )}

                {rcCountdown === 0 && !rcPolling && (
                  <div className="flex gap-2 justify-end">
                    <Button variant="flat" color="default" onPress={() => { setRcStep("form"); setRcDeviceInfo(null); setRcError(null); }}>
                      Try Again
                    </Button>
                    <Button variant="flat" color="default" onPress={closeReconnect}>
                      Cancel
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
