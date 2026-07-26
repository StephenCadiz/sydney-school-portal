"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "../../lib/supabase";

export const STAFF_MESSAGE_SOUND_STORAGE_KEY =
  "ss_staff_message_sound_enabled";
export const STAFF_MESSAGE_SOUND_CHANGE_EVENT =
  "sydney-school-staff-message-sound-change";

const NOTIFICATION_CHANNEL_NAME =
  "sydney-school-staff-message-notifications";
const PLAYED_MESSAGES_STORAGE_KEY =
  "ss_staff_message_recently_played";
const PLAYED_MESSAGE_TTL_MS = 5 * 60 * 1000;
const MAX_PLAYED_MESSAGES = 50;

type StaffRole = "teacher" | "admin";
type SenderRole = StaffRole | "student" | null;

type MessageInsert = {
  id?: string | null;
  sender_id?: string | null;
  receiver_id?: string | null;
  recipient_group?: string | null;
  recipient_deleted_at?: string | null;
};

type PlayedMessage = {
  id: string;
  timestamp: number;
};

type SoundPreferenceEvent = CustomEvent<{ enabled?: boolean }>;

function readSoundPreference() {
  try {
    return window.localStorage.getItem(STAFF_MESSAGE_SOUND_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function announceSoundPreference(enabled: boolean) {
  window.dispatchEvent(
    new CustomEvent(STAFF_MESSAGE_SOUND_CHANGE_EVENT, {
      detail: { enabled },
    })
  );
}

export function useStaffMessageSoundPreference() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readSoundPreference());

    const handlePreferenceChange = (event: Event) => {
      const requestedValue = (event as SoundPreferenceEvent).detail?.enabled;
      setEnabled(
        typeof requestedValue === "boolean"
          ? requestedValue
          : readSoundPreference()
      );
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STAFF_MESSAGE_SOUND_STORAGE_KEY) {
        setEnabled(event.newValue !== "false");
      }
    };

    window.addEventListener(
      STAFF_MESSAGE_SOUND_CHANGE_EVENT,
      handlePreferenceChange
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        STAFF_MESSAGE_SOUND_CHANGE_EVENT,
        handlePreferenceChange
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setSoundEnabled = useCallback((nextEnabled: boolean) => {
    try {
      window.localStorage.setItem(
        STAFF_MESSAGE_SOUND_STORAGE_KEY,
        String(nextEnabled)
      );
    } catch {
      // The in-tab preference still works when storage is unavailable.
    }

    setEnabled(nextEnabled);
    announceSoundPreference(nextEnabled);
  }, []);

  return { soundEnabled: enabled, setSoundEnabled };
}

function readRecentPlayedMessages(now: number) {
  try {
    const stored = window.localStorage.getItem(PLAYED_MESSAGES_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is PlayedMessage =>
          Boolean(
            entry &&
              typeof entry.id === "string" &&
              typeof entry.timestamp === "number" &&
              now - entry.timestamp < PLAYED_MESSAGE_TTL_MS
          )
      )
      .slice(-MAX_PLAYED_MESSAGES);
  } catch {
    return [];
  }
}

function claimMessageInStorage(messageId: string) {
  const now = Date.now();
  const recentMessages = readRecentPlayedMessages(now);

  if (recentMessages.some((entry) => entry.id === messageId)) {
    return false;
  }

  try {
    window.localStorage.setItem(
      PLAYED_MESSAGES_STORAGE_KEY,
      JSON.stringify(
        [...recentMessages, { id: messageId, timestamp: now }].slice(
          -MAX_PLAYED_MESSAGES
        )
      )
    );
  } catch {
    // In-memory and BroadcastChannel guards still provide best-effort protection.
  }

  return true;
}

async function claimMessage(messageId: string) {
  const lockManager = navigator.locks;

  if (lockManager) {
    try {
      return await lockManager.request(
        `${NOTIFICATION_CHANNEL_NAME}-${messageId}`,
        () => claimMessageInStorage(messageId)
      );
    } catch {
      // Fall back to the storage claim below.
    }
  }

  return claimMessageInStorage(messageId);
}

function isPotentialRecipient(
  message: MessageInsert,
  userId: string,
  role: StaffRole
) {
  if (
    !message.id ||
    !message.sender_id ||
    message.sender_id === userId ||
    message.recipient_deleted_at != null
  ) {
    return false;
  }

  const hasNoRecipientGroup = !message.recipient_group;

  if (role === "teacher") {
    return message.receiver_id === userId && hasNoRecipientGroup;
  }

  return (
    message.recipient_group === "admin" ||
    (message.receiver_id === userId && hasNoRecipientGroup)
  );
}

function senderRoleQualifies(role: StaffRole, senderRole: SenderRole) {
  return role === "teacher"
    ? senderRole === "teacher" || senderRole === "admin"
    : senderRole === "teacher";
}

type UseStaffMessageNotificationsOptions = {
  userId: string;
  role: StaffRole;
  enabled?: boolean;
  refreshEventName: string;
};

export function useStaffMessageNotifications({
  userId,
  role,
  enabled = true,
  refreshEventName,
}: UseStaffMessageNotificationsOptions) {
  const soundEnabledRef = useRef(true);
  const handledMessageIdsRef = useRef(new Set<string>());
  const senderRoleCacheRef = useRef(new Map<string, SenderRole>());
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    soundEnabledRef.current = readSoundPreference();

    const handlePreferenceChange = (event: Event) => {
      const requestedValue = (event as SoundPreferenceEvent).detail?.enabled;
      soundEnabledRef.current =
        typeof requestedValue === "boolean"
          ? requestedValue
          : readSoundPreference();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STAFF_MESSAGE_SOUND_STORAGE_KEY) {
        soundEnabledRef.current = event.newValue !== "false";
      }
    };

    window.addEventListener(
      STAFF_MESSAGE_SOUND_CHANGE_EVENT,
      handlePreferenceChange
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        STAFF_MESSAGE_SOUND_CHANGE_EVENT,
        handlePreferenceChange
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !userId || (role !== "teacher" && role !== "admin")) return;

    const getAudioContext = () => {
      if (!audioContextRef.current && typeof AudioContext !== "undefined") {
        audioContextRef.current = new AudioContext();
      }

      return audioContextRef.current;
    };
    const unlockAudio = async () => {
      try {
        const context = getAudioContext();
        if (context?.state === "suspended") {
          await context.resume();
        }

        if (context?.state === "running") {
          window.removeEventListener("pointerdown", unlockAudio);
          window.removeEventListener("keydown", unlockAudio);
        }
      } catch {
        // Sound is optional; unread updates must continue.
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [enabled, role, userId]);

  useEffect(() => {
    if (!enabled || !userId || (role !== "teacher" && role !== "admin")) return;

    let cancelled = false;
    const claimedByAnotherTab = new Set<string>();
    const broadcast =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(NOTIFICATION_CHANNEL_NAME);

    if (broadcast) {
      broadcast.onmessage = (event: MessageEvent<{ messageId?: string }>) => {
        if (event.data?.messageId) {
          claimedByAnotherTab.add(event.data.messageId);
        }
      };
    }

    async function getSenderRole(senderId: string): Promise<SenderRole> {
      if (senderRoleCacheRef.current.has(senderId)) {
        return senderRoleCacheRef.current.get(senderId) ?? null;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", senderId)
          .maybeSingle();

        const senderRole: SenderRole =
          !error &&
          (data?.role === "teacher" ||
            data?.role === "admin" ||
            data?.role === "student")
            ? data.role
            : null;

        senderRoleCacheRef.current.set(senderId, senderRole);
        return senderRole;
      } catch {
        return null;
      }
    }

    async function playChime() {
      try {
        if (typeof AudioContext === "undefined") return;

        const context =
          audioContextRef.current ?? (audioContextRef.current = new AudioContext());

        if (context.state === "suspended") {
          await context.resume();
        }
        if (context.state !== "running") return;

        const now = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
        gain.connect(context.destination);

        [
          { frequency: 523.25, start: now, stop: now + 0.38 },
          { frequency: 659.25, start: now + 0.16, stop: now + 0.62 },
        ].forEach(({ frequency, start, stop }) => {
          const oscillator = context.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, start);
          oscillator.connect(gain);
          oscillator.start(start);
          oscillator.stop(stop);
        });
      } catch {
        // Sound is optional; unread updates have already been requested.
      }
    }

    async function handleInsert(message: MessageInsert) {
      const messageId = message.id;

      if (
        !messageId ||
        handledMessageIdsRef.current.has(messageId) ||
        !isPotentialRecipient(message, userId, role)
      ) {
        return;
      }

      handledMessageIdsRef.current.add(messageId);

      const senderRole = await getSenderRole(message.sender_id!);
      if (cancelled || !senderRoleQualifies(role, senderRole)) return;

      window.dispatchEvent(new Event(refreshEventName));

      if (
        !soundEnabledRef.current ||
        claimedByAnotherTab.has(messageId) ||
        !(await claimMessage(messageId)) ||
        cancelled
      ) {
        return;
      }

      broadcast?.postMessage({ messageId });
      await playChime();
    }

    const channel = supabase
      .channel(`staff-message-notifications-${role}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          void handleInsert(payload.new as MessageInsert);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      broadcast?.close();
      void supabase.removeChannel(channel);
    };
  }, [enabled, refreshEventName, role, userId]);

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;

      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    },
    []
  );
}
