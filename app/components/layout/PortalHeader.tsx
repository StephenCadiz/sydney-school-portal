"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import TeacherLiveClock from "./TeacherLiveClock";

type Props = {
  title: string;
  firstName?: string;
  showWelcome?: boolean;
  unreadMessageCount?: number;
  onMenuOpen?: () => void;
};

function getMadridHeader(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour || 12);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return {
    greeting,
    date: `${values.weekday || ""}, ${values.day || ""} ${values.month || ""} ${
      values.year || ""
    }`.trim(),
  };
}

function EnvelopeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export default function PortalHeader({
  title,
  firstName = "",
  showWelcome = false,
  unreadMessageCount = 0,
  onMenuOpen,
}: Props) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const header = getMadridHeader(currentTime);
  const visibleFirstName = firstName.trim();
  const identityText = visibleFirstName
    ? showWelcome
      ? `${header.greeting}, ${visibleFirstName}`
      : `Logged in as ${visibleFirstName}`
    : "Loading your workspace…";
  const unreadMessageLabel =
    unreadMessageCount > 0
      ? `Messages, ${unreadMessageCount} unread message${
          unreadMessageCount === 1 ? "" : "s"
        }`
      : "Messages, no unread messages";
  const visibleUnreadCount =
    unreadMessageCount > 99 ? "99+" : String(unreadMessageCount);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="teacher-portal-header"
      style={{
        background: "#ffffff",
        padding: "calc(18px + 1cm) 24px",
        borderRadius: "12px",
        marginBottom: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "20px",
        flexWrap: "wrap",
        border: "1px solid #e3e8ef",
      }}
    >
      <div
        className="teacher-portal-header-brand"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          minWidth: 0,
        }}
      >
        <Image
          src="/LOGO and NAME.png"
          alt="Sydney School"
          width={220}
          height={81}
          style={{
            height: "auto",
            width: "auto",
          }}
        />

        <div>
          <h1
            style={{
              margin: 0,
              color: "#1f3c88",
              fontSize: "2.2rem",
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
        </div>
      </div>
      <div className="teacher-portal-header-identity" aria-live="polite">
        <strong>{identityText}</strong>
        <time dateTime={currentTime.toISOString()}>{header.date}</time>
        <span>Your teaching workspace</span>
      </div>
      <div className="teacher-portal-header-actions">
        <Link
          href="/teacher/messages"
          className={`teacher-portal-message-control ${
            unreadMessageCount > 0 ? "has-unread" : ""
          }`}
          aria-label={unreadMessageLabel}
        >
          <EnvelopeIcon />
          <span aria-hidden="true">{visibleUnreadCount}</span>
        </Link>
        <TeacherLiveClock showLabel={false} />
        <button
          type="button"
          className="mobile-menu-button teacher-header-menu-button"
          aria-label="Open teacher menu"
          onClick={onMenuOpen}
        >
          Menu
        </button>
      </div>
    </div>
  );
}
