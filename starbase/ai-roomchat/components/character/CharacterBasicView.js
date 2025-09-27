"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteHeroById,
  fetchHeroesByOwner,
  syncHeroBgms,
  updateHeroById,
} from "../../services/heroes";
import { supabase } from "../../lib/supabase";
import { extractFileName, sanitizeFileName } from "../../utils/characterAssets";
import useGameBrowser from "../lobby/hooks/useGameBrowser";
import { SORT_OPTIONS } from "../lobby/constants";
import ChatOverlay from "../social/ChatOverlay";
import FriendOverlay from "../social/FriendOverlay";
import { useHeroSocial } from "../../hooks/social/useHeroSocial";

const DEFAULT_HERO_NAME = "이름 없는 영웅";
const DEFAULT_DESCRIPTION =
  "소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.";

const dockItems = [
  { key: "search", label: "게임 검색", type: "overlay" },
  { key: "ranking", label: "랭킹", type: "overlay" },
  { key: "settings", label: "설정", type: "overlay" },
  { key: "battle", label: "전투 시작", type: "action" },
  { key: "roster", label: "로스터", type: "overlay" },
];

const eqPresets = [
  { key: "flat", label: "플랫" },
  { key: "bass", label: "저음 강화" },
  { key: "clarity", label: "명료도 향상" },
];

const EQ_BAND_MIN = -12;
const EQ_BAND_MAX = 12;
const EQ_BAND_STEP = 0.5;

const HERO_STORAGE_BUCKET = "heroes";
const MAX_BGM_TRACKS = 1;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const rosterNotices = [
  {
    id: "notice-community",
    title: "공식 커뮤니티 오픈!",
    message:
      "로비에서 가장 뜨거운 영웅들을 만나보세요. 새로운 모험이 기다리고 있어요.",
  },
  {
    id: "notice-update",
    title: "시즌 프리시즌 이벤트 준비 중",
    message: "다가오는 시즌을 맞아 전투 준비 이벤트가 곧 열릴 예정이에요.",
  },
];

const overlayCopy = {
  character: "이미지를 터치하면 설명과 능력이 순서대로 나타납니다.",
  search:
    "신작과 인기 게임을 살펴보고 바로 제작·등록 메뉴로 이동할 수 있습니다.",
  ranking: "시즌별 팀 랭킹과 개인 순위를 준비 중이에요.",
  roster: "로스터에서 영웅을 선택하면 바로 해당 캐릭터 화면으로 이동합니다.",
};

const COOKIE_PREFIX = "starbase_character_";
const BGM_ENABLED_COOKIE = `${COOKIE_PREFIX}bgm_enabled`;
const BGM_VOLUME_COOKIE = `${COOKIE_PREFIX}bgm_volume`;
const EQ_PRESET_COOKIE = `${COOKIE_PREFIX}eq_preset`;
const EFFECTS_COOKIE = `${COOKIE_PREFIX}sfx_enabled`;
const REVERB_COOKIE = `${COOKIE_PREFIX}reverb_level`;
const COMPRESSOR_COOKIE = `${COOKIE_PREFIX}compressor_level`;
const EQ_BANDS_COOKIE = `${COOKIE_PREFIX}eq_bands`;

let cachedImpulseBuffer = null;

function makeBgmId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bgm_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normaliseBgmLabel(label, index = 0) {
  if (typeof label === "string" && label.trim()) {
    return label.trim();
  }
  return `브금 ${index + 1}`;
}

function createBgmDraftFromRecord(record, index = 0) {
  if (!record) {
    return {
      id: makeBgmId(),
      label: normaliseBgmLabel(null, index),
      url: "",
      storage_path: null,
      duration: null,
      mime: null,
      sort_order: index,
      file: null,
      objectUrl: null,
      error: null,
      isNew: true,
    };
  }

  const sortOrder = Number.isFinite(record.sort_order) ? record.sort_order : index;

  return {
    id: record.id || makeBgmId(),
    label: normaliseBgmLabel(record.label, sortOrder),
    url: record.url || record.bgm_url || "",
    storage_path: record.storage_path || null,
    duration:
      typeof record.duration_seconds === "number"
        ? record.duration_seconds
        : typeof record.bgm_duration_seconds === "number"
          ? record.bgm_duration_seconds
          : null,
    mime: record.mime || record.bgm_mime || null,
    sort_order: sortOrder,
    file: null,
    objectUrl: null,
    error: null,
    isNew: !record.id,
  };
}

function createBgmStateFromHero(hero) {
  if (!hero) return [];
  const records = Array.isArray(hero.bgms) && hero.bgms.length
    ? hero.bgms
    : hero.bgm_url
      ? [
          {
            id: null,
            label: "기본",
            url: hero.bgm_url,
            duration_seconds: hero.bgm_duration_seconds ?? null,
            mime: hero.bgm_mime ?? null,
            sort_order: 0,
          },
        ]
      : [];

  const limited = records.slice(0, MAX_BGM_TRACKS);
  const sorted = limited
    .map((record, index) => createBgmDraftFromRecord(record, index))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.label.localeCompare(b.label);
    });

  return reindexBgmTracks(sorted);
}

function formatBgmDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "길이 미확인";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(Math.max(0, remaining)).padStart(2, "0")}`;
}

function formatPlaybackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(Math.max(0, remaining)).padStart(2, "0")}`;
}

function readAudioDurationFromFile(file) {
  if (!file) return Promise.resolve(null);
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let objectUrl = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (error) {
      console.warn("Failed to create object URL for audio duration", error);
      resolve(null);
      return;
    }

    const audioEl = document.createElement("audio");
    const cleanup = () => {
      audioEl.removeAttribute("src");
      audioEl.load();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };

    const handleLoaded = () => {
      const duration = Number.isFinite(audioEl.duration)
        ? Math.max(0, Math.round(audioEl.duration))
        : null;
      cleanup();
      resolve(duration);
    };

    const handleError = () => {
      cleanup();
      resolve(null);
    };

    audioEl.addEventListener("loadedmetadata", handleLoaded, { once: true });
    audioEl.addEventListener("error", handleError, { once: true });

    audioEl.preload = "metadata";
    audioEl.src = objectUrl;
    audioEl.load();
  });
}

function reindexBgmTracks(list) {
  return list.map((track, index) => ({ ...track, sort_order: index }));
}

const BLOCKED_STORAGE_KEY = "starbase_blocked_heroes";

function normaliseBlockedHeroes(list) {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.filter(Boolean)));
}

function readBlockedHeroes() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BLOCKED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normaliseBlockedHeroes(parsed);
  } catch (error) {
    console.warn("Failed to read blocked heroes", error);
    return [];
  }
}

function persistBlockedHeroes(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BLOCKED_STORAGE_KEY,
      JSON.stringify(normaliseBlockedHeroes(list)),
    );
  } catch (error) {
    console.warn("Failed to persist blocked heroes", error);
  }
}

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (let i = 0; i < cookies.length; i += 1) {
    const [cookieName, ...rest] = cookies[i].split("=");
    if (cookieName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function writeCookie(name, value, days = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000,
  ).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function createImpulseResponse(context, seconds = 2.3, decay = 2.8) {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = context.createBuffer(2, length, rate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const buffer = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const attenuation = Math.pow(1 - i / length, decay);
      buffer[i] = (Math.random() * 2 - 1) * attenuation;
    }
  }

  return impulse;
}

function getImpulseBuffer(context) {
  if (cachedImpulseBuffer && cachedImpulseBuffer.sampleRate === context.sampleRate) {
    return cachedImpulseBuffer;
  }

  cachedImpulseBuffer = createImpulseResponse(context);
  return cachedImpulseBuffer;
}

function createAudioProcessingGraph(context, audioElement) {
  const source = context.createMediaElementSource(audioElement);

  const low = context.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 320;

  const mid = context.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1200;
  mid.Q.value = 1.1;

  const high = context.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 3200;

  const dryGain = context.createGain();
  dryGain.gain.value = 1;

  const wetGain = context.createGain();
  wetGain.gain.value = 0;

  const reverb = context.createConvolver();
  reverb.buffer = getImpulseBuffer(context);

  const compressor = context.createDynamicsCompressor();
  const masterGain = context.createGain();
  masterGain.gain.value = 1;

  source.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(dryGain);
  high.connect(reverb);

  reverb.connect(wetGain);
  dryGain.connect(compressor);
  wetGain.connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(context.destination);

  return {
    element: audioElement,
    source,
    low,
    mid,
    high,
    dryGain,
    wetGain,
    reverb,
    compressor,
    masterGain,
  };
}

function disconnectAudioGraph(graph) {
  if (!graph) return;
  try {
    graph.source.disconnect();
  } catch (error) {
    console.warn("Failed to disconnect audio source", error);
  }

  [
    graph.low,
    graph.mid,
    graph.high,
    graph.dryGain,
    graph.wetGain,
    graph.reverb,
    graph.compressor,
    graph.masterGain,
  ].forEach((node) => {
    if (!node) return;
    try {
      node.disconnect();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to disconnect audio node", error);
    }
  });
}

function formatRosterTimestamp(value) {
  if (!value) return "갱신 정보 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "갱신 정보 없음";
  try {
    const datePart = date.toLocaleDateString("ko-KR");
    const timePart = date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `갱신: ${datePart} ${timePart}`;
  } catch (error) {
    return `갱신: ${date.toISOString().slice(0, 16).replace("T", " ")}`;
  }
}

function formatGameDate(value) {
  if (!value) return "날짜 미상";
  try {
    return new Date(value).toLocaleDateString("ko-KR");
  } catch (error) {
    return "날짜 미상";
  }
}

function createDraftFromHero(hero) {
  return {
    name: hero?.name || "",
    description: hero?.description || "",
    ability1: hero?.ability1 || "",
    ability2: hero?.ability2 || "",
    ability3: hero?.ability3 || "",
    ability4: hero?.ability4 || "",
    image_url: hero?.image_url || "",
    background_url: hero?.background_url || "",
  };
}

const pageStyles = {
  base: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    justifyContent: "center",
    padding: "28px 16px 200px",
    boxSizing: "border-box",
    background:
      "linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.82) 45%, rgba(15,23,42,0.92) 100%)",
    color: "#f8fafc",
  },
  withBackground: (imageUrl) => ({
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    justifyContent: "center",
    padding: "28px 16px 200px",
    boxSizing: "border-box",
    color: "#f8fafc",
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.78) 60%, rgba(15,23,42,0.9) 100%), url(${imageUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
  }),
};

const styles = {
  stage: {
    width: "100%",
    maxWidth: 960,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 48,
  },
  heroSection: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 24,
  },
  heroCardShell: {
    width: "100%",
    maxWidth: 520,
  },
  heroCard: {
    position: "relative",
    width: "100%",
    paddingTop: "160%",
    borderRadius: 36,
    overflow: "hidden",
    border: "1px solid rgba(96,165,250,0.32)",
    background: "rgba(15,23,42,0.62)",
    boxShadow: "0 46px 120px -60px rgba(37,99,235,0.4)",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  },
  heroImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "filter 0.3s ease",
    WebkitTapHighlightColor: "transparent",
  },
  heroFallback: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 72,
    fontWeight: 800,
    background:
      "linear-gradient(135deg, rgba(30,64,175,0.45) 0%, rgba(30,41,59,0.92) 100%)",
  },
  heroNameOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    padding: "0 32px 52px",
    background:
      "linear-gradient(0deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.6) 35%, rgba(15,23,42,0.35) 60%, rgba(15,23,42,0) 100%)",
    pointerEvents: "none",
    gap: 12,
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  heroInfoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "24px 32px 48px",
    background:
      "linear-gradient(0deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.72) 45%, rgba(15,23,42,0.4) 70%, rgba(15,23,42,0) 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    pointerEvents: "none",
    justifyContent: "flex-end",
    maxHeight: "72%",
  },
  heroInfoTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#e0f2fe",
    letterSpacing: 0.2,
  },
  heroInfoText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.7,
    color: "rgba(226,232,240,0.94)",
    whiteSpace: "pre-line",
  },
  cornerIcon: {
    position: "absolute",
    top: 18,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 14,
    background: "rgba(15,23,42,0.58)",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "repeat(3, 1fr)",
    gap: 3,
    padding: 6,
    boxShadow: "0 14px 30px -22px rgba(15,23,42,0.8)",
  },
  cornerDot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: "rgba(226,232,240,0.78)",
  },
  overlayContainer: {
    position: "fixed",
    left: "50%",
    bottom: 18,
    transform: "translateX(-50%)",
    width: "min(88vw, 720px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    zIndex: 60,
  },
  overlayPanel: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "rgba(15,23,42,0.78)",
    borderRadius: 24,
    padding: "16px 18px 18px",
    boxShadow: "0 28px 80px -54px rgba(15,23,42,0.95)",
    border: "1px solid rgba(96,165,250,0.3)",
    backdropFilter: "blur(12px)",
  },
  overlayToggleButton: {
    alignSelf: "center",
    width: 44,
    height: 32,
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(15,23,42,0.72)",
    color: "#e0f2fe",
    fontSize: 16,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    outline: "none",
    boxShadow: "0 16px 42px -38px rgba(14,165,233,0.9)",
  },
  overlayButtonsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  characterFooterRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },
  chatLauncherButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid rgba(96,165,250,0.45)",
    background: "rgba(15,23,42,0.55)",
    color: "#e0f2fe",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    cursor: "pointer",
    outline: "none",
    boxShadow: "0 12px 32px -28px rgba(56,189,248,0.8)",
  },
  chatLauncherBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    background: "#f97316",
    color: "#0f172a",
    fontSize: 11,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
  },
  friendLauncherButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid rgba(94,234,212,0.42)",
    background: "rgba(20,83,45,0.45)",
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    cursor: "pointer",
    outline: "none",
    boxShadow: "0 12px 30px -28px rgba(16,185,129,0.65)",
  },
  friendLauncherBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    background: "rgba(59,130,246,0.9)",
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
  },
  overlayButton: (active) => ({
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid",
    borderColor: active ? "rgba(125,211,252,0.9)" : "rgba(148,163,184,0.4)",
    background: active ? "rgba(56,189,248,0.22)" : "rgba(15,23,42,0.42)",
    color: "#e0f2fe",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    cursor: "pointer",
    transition: "all 0.2s ease",
    outline: "none",
  }),
  overlayActionButton: {
    padding: "10px 18px",
    borderRadius: 999,
    border: "none",
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.95) 0%, rgba(14,165,233,0.92) 100%)",
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.6,
    cursor: "pointer",
    boxShadow: "0 18px 42px -26px rgba(14,165,233,0.8)",
    outline: "none",
  },
  overlayCopy: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.6,
    color: "rgba(226,232,240,0.86)",
  },
  overlayContent: {
    maxHeight: "46vh",
    overflowY: "auto",
    paddingRight: 4,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    WebkitOverflowScrolling: "touch",
  },
  bgmBar: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 18,
    border: "1px solid rgba(96,165,250,0.28)",
    background: "rgba(15,23,42,0.78)",
    boxShadow: "0 18px 40px -30px rgba(14,165,233,0.65)",
  },
  bgmMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bgmMetaInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  bgmTrackTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#e0f2fe",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  bgmMetaSub: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    fontWeight: 500,
    color: "rgba(191,219,254,0.82)",
  },
  bgmTrackIndex: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
    padding: "2px 10px",
    borderRadius: 999,
    background: "rgba(56,189,248,0.2)",
    color: "#bae6fd",
    fontSize: 11,
    fontWeight: 600,
  },
  bgmMetaTimes: {
    fontVariantNumeric: "tabular-nums",
  },
  bgmCollapseButton: {
    border: "none",
    background: "rgba(15,23,42,0.65)",
    color: "#cbd5f5",
    borderRadius: 999,
    width: 32,
    height: 32,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 24px -18px rgba(56,189,248,0.9)",
  },
  bgmControlsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  bgmControlsGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  bgmQuickActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  bgmQuickButton: {
    border: "1px solid rgba(125,211,252,0.85)",
    background: "rgba(30,64,175,0.45)",
    color: "#e0f2fe",
    borderRadius: 999,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s ease",
  },
  bgmControlButton: (active = false, disabled = false) => ({
    border: "1px solid",
    borderColor: active ? "rgba(125,211,252,0.95)" : "rgba(148,163,184,0.36)",
    background: active
      ? "linear-gradient(135deg, rgba(56,189,248,0.42) 0%, rgba(14,165,233,0.32) 100%)"
      : "rgba(15,23,42,0.58)",
    color: "#f1f5f9",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.2s ease",
    minWidth: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }),
  bgmProgressRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  bgmTime: {
    fontSize: 11,
    fontWeight: 500,
    color: "rgba(226,232,240,0.72)",
    minWidth: 44,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
  bgmProgressTrack: {
    flexGrow: 1,
    position: "relative",
    height: 8,
    borderRadius: 999,
    background: "rgba(71,85,105,0.6)",
    overflow: "hidden",
    cursor: "pointer",
    touchAction: "none",
  },
  bgmProgressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "0%",
    borderRadius: 999,
    background:
      "linear-gradient(135deg, rgba(59,130,246,0.92) 0%, rgba(20,184,166,0.88) 100%)",
  },
  bgmProgressHandle: {
    position: "absolute",
    top: "50%",
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#e0f2fe",
    boxShadow: "0 0 12px rgba(56,189,248,0.65)",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  },
  gameSearchPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  gameSearchControls: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  gameSearchInput: {
    flexGrow: 1,
    minWidth: 0,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(96,165,250,0.35)",
    background: "rgba(15,23,42,0.65)",
    color: "#e2e8f0",
    fontSize: 13,
    outline: "none",
  },
  gameSearchSelect: {
    minWidth: 140,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(15,23,42,0.7)",
    color: "#cbd5f5",
    fontSize: 13,
    outline: "none",
  },
  gameSearchLayout: {
    display: "flex",
    gap: 14,
  },
  gameSearchListSection: {
    flex: "0 0 42%",
    display: "flex",
    flexDirection: "column",
    background: "rgba(15,23,42,0.58)",
    borderRadius: 16,
    border: "1px solid rgba(96,165,250,0.25)",
    padding: 12,
    overflow: "hidden",
  },
  gameSearchStatus: {
    margin: 0,
    fontSize: 12,
    color: "rgba(191,219,254,0.8)",
  },
  gameSearchList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "auto",
  },
  gameSearchListItemWrapper: {
    margin: 0,
    padding: 0,
  },
  gameSearchListItem: (active) => ({
    width: "100%",
    textAlign: "left",
    borderRadius: 12,
    border: "1px solid",
    borderColor: active ? "rgba(56,189,248,0.9)" : "rgba(148,163,184,0.28)",
    background: active ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.6)",
    color: "#e2e8f0",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    cursor: "pointer",
  }),
  gameSearchListHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  gameSearchListTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#f0f9ff",
    margin: 0,
  },
  gameSearchListMetric: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(148,163,184,0.85)",
  },
  gameSearchListDescription: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.4,
    color: "rgba(203,213,225,0.85)",
  },
  gameSearchListMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "rgba(148,163,184,0.75)",
  },
  gameSearchDetailSection: {
    flex: 1,
    display: "flex",
    background: "rgba(15,23,42,0.7)",
    borderRadius: 16,
    border: "1px solid rgba(96,165,250,0.25)",
    padding: 14,
    overflow: "hidden",
  },
  gameSearchDetailCard: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    width: "100%",
    overflowY: "auto",
  },
  gameSearchDetailHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  gameSearchDetailTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#f8fafc",
  },
  gameSearchDetailDescription: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: "rgba(203,213,225,0.9)",
  },
  gameSearchDetailMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 11,
    color: "rgba(148,163,184,0.78)",
  },
  gameSearchRolesSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  gameSearchSectionTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: "#e0f2fe",
  },
  gameSearchRoleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 10,
  },
  gameSearchRoleButton: (active, disabled) => ({
    borderRadius: 12,
    border: "1px solid",
    borderColor: active
      ? "rgba(56,189,248,0.9)"
      : disabled
        ? "rgba(148,163,184,0.3)"
        : "rgba(148,163,184,0.4)",
    background: active
      ? "linear-gradient(135deg, rgba(56,189,248,0.25) 0%, rgba(14,165,233,0.18) 100%)"
      : "rgba(15,23,42,0.65)",
    color: disabled ? "rgba(148,163,184,0.6)" : "#e2e8f0",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    alignItems: "flex-start",
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  gameSearchRoleName: {
    fontSize: 13,
    fontWeight: 700,
  },
  gameSearchRoleCapacity: {
    fontSize: 11,
    color: "rgba(148,163,184,0.75)",
  },
  gameSearchParticipantsSummary: {
    margin: 0,
    fontSize: 12,
    color: "rgba(191,219,254,0.8)",
  },
  gameSearchEnterButton: (highlight) => ({
    border: "none",
    borderRadius: 999,
    padding: "12px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    color: "#0f172a",
    background: highlight
      ? "linear-gradient(135deg, rgba(59,130,246,0.9) 0%, rgba(96,165,250,0.85) 100%)"
      : "linear-gradient(135deg, rgba(148,163,184,0.65) 0%, rgba(203,213,225,0.65) 100%)",
  }),
  gameSearchActionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  gamePrimaryAction: {
    border: "none",
    borderRadius: 12,
    padding: "10px 16px",
    background: "linear-gradient(135deg, rgba(34,197,94,0.9) 0%, rgba(22,163,74,0.85) 100%)",
    color: "#ecfeff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  gameSecondaryAction: {
    border: "1px solid rgba(148,163,184,0.4)",
    borderRadius: 12,
    padding: "10px 16px",
    background: "rgba(15,23,42,0.65)",
    color: "#cbd5f5",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  rosterPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  noticeList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  noticeCard: {
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(96,165,250,0.28)",
    background: "rgba(15,23,42,0.55)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  noticeBadge: {
    alignSelf: "flex-start",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: "rgba(59,130,246,0.25)",
    color: "#bfdbfe",
  },
  noticeTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  noticeCopy: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    color: "rgba(148,163,184,0.92)",
  },
  rosterList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  rosterHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rosterTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    color: "#bae6fd",
  },
  rosterRefresh: {
    border: "none",
    background: "rgba(59,130,246,0.18)",
    color: "#e0f2fe",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  rosterButton: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid",
    borderColor: active ? "rgba(56,189,248,0.9)" : "rgba(148,163,184,0.28)",
    background: active ? "rgba(56,189,248,0.18)" : "rgba(15,23,42,0.55)",
    color: "#f8fafc",
    cursor: "pointer",
    textAlign: "left",
  }),
  rosterAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    objectFit: "cover",
    background: "rgba(51,65,85,0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 16,
    color: "#cbd5f5",
  },
  rosterAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
    objectFit: "cover",
    border: "1px solid rgba(30,64,175,0.45)",
  },
  rosterMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  rosterName: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
  },
  rosterTimestamp: {
    margin: 0,
    fontSize: 11,
    color: "rgba(148,163,184,0.9)",
  },
  rosterEmpty: {
    margin: 0,
    fontSize: 12,
    color: "rgba(148,163,184,0.9)",
  },
  rosterError: {
    margin: 0,
    fontSize: 12,
    color: "#fca5a5",
  },
  settingsPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  settingsSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 16,
    background: "rgba(15,23,42,0.55)",
    border: "1px solid rgba(94, 234, 212, 0.15)",
  },
  settingsHeading: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    color: "#a5f3fc",
    letterSpacing: 0.4,
  },
  settingsRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  slider: {
    width: "100%",
  },
  toggleButton: (enabled) => ({
    alignSelf: "flex-start",
    padding: 0,
    width: 54,
    height: 30,
    borderRadius: 999,
    border: enabled
      ? "1px solid rgba(125,211,252,0.85)"
      : "1px solid rgba(148,163,184,0.35)",
    background: enabled
      ? "linear-gradient(135deg, rgba(45,212,191,0.88) 0%, rgba(56,189,248,0.82) 100%)"
      : "rgba(15,23,42,0.65)",
    position: "relative",
    cursor: "pointer",
    outline: "none",
  }),
  toggleKnob: (enabled) => ({
    position: "absolute",
    top: 3,
    left: enabled ? 28 : 3,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: enabled ? "#0f172a" : "#e2e8f0",
    transition: "left 0.18s ease",
  }),
  settingsLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(226,232,240,0.9)",
    margin: 0,
  },
  settingsHelper: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "rgba(148,163,184,0.92)",
    margin: 0,
  },
  settingsSubheading: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: "#bae6fd",
  },
  settingsSliderRow: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  settingsButtonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  settingsButton: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(15,23,42,0.55)",
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
  },
  dangerButton: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.55)",
    background: "rgba(127,29,29,0.45)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    outline: "none",
  },
  editForm: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  assetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
  },
  assetCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.32)",
    background: "rgba(15,23,42,0.55)",
  },
  assetTitle: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(226,232,240,0.88)",
    letterSpacing: 0.2,
  },
  assetPreviewFrame: {
    position: "relative",
    width: "100%",
    paddingTop: "58%",
    borderRadius: 12,
    overflow: "hidden",
    background: "rgba(30,41,59,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  assetPreviewImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  assetPlaceholder: {
    fontSize: 12,
    color: "rgba(148,163,184,0.82)",
    textAlign: "center",
    padding: "12px 16px",
  },
  assetButtonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  assetActionButton: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.38)",
    background: "rgba(15,23,42,0.62)",
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
  },
  assetDangerButton: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(248,113,113,0.5)",
    background: "rgba(127,29,29,0.4)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
  },
  bgmList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  bgmEmpty: {
    margin: 0,
    fontSize: 12,
    color: "rgba(148,163,184,0.8)",
  },
  bgmTrackCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(96,165,250,0.28)",
    background: "rgba(15,23,42,0.58)",
  },
  bgmTrackHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  bgmTrackHeaderTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(226,232,240,0.92)",
  },
  bgmTrackBadge: {
    padding: "2px 8px",
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(191,219,254,0.9)",
    background: "rgba(37,99,235,0.28)",
  },
  bgmTrackField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  bgmTrackLabel: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(148,163,184,0.85)",
  },
  bgmTrackMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  bgmTrackButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  assetMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  assetMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "space-between",
    fontSize: 12,
    color: "rgba(226,232,240,0.86)",
  },
  assetMetaLabel: {
    fontWeight: 700,
    color: "rgba(148,163,184,0.85)",
  },
  assetMetaValue: {
    fontWeight: 600,
  },
  editField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(226,232,240,0.9)",
  },
  editInput: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(15,23,42,0.65)",
    color: "#f8fafc",
    fontSize: 13,
  },
  editTextarea: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(15,23,42,0.65)",
    color: "#f8fafc",
    fontSize: 13,
    minHeight: 88,
  },
  formActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryFormButton: {
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.92) 0%, rgba(56,189,248,0.88) 100%)",
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    outline: "none",
  },
  secondaryFormButton: {
    padding: "10px 18px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(15,23,42,0.55)",
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
  },
  statusText: (variant) => ({
    fontSize: 12,
    color: variant === "error" ? "#fca5a5" : "#bbf7d0",
    margin: 0,
  }),
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
    width: 0,
    height: 0,
  },
};

export default function CharacterBasicView({ hero }) {
  const router = useRouter();
  const [currentHero, setCurrentHero] = useState(hero ?? null);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [overlayCollapsed, setOverlayCollapsed] = useState(false);
  const [bgmBarCollapsed, setBgmBarCollapsed] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [eqPreset, setEqPreset] = useState("flat");
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [reverbLevel, setReverbLevel] = useState(0.25);
  const [compressorLevel, setCompressorLevel] = useState(0.4);
  const [eqBands, setEqBands] = useState({ low: 0, mid: 0, high: 0 });
  const [showEditForm, setShowEditForm] = useState(false);
  const [editDraft, setEditDraft] = useState(() => createDraftFromHero(hero));
  const [savingHero, setSavingHero] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [imageAsset, setImageAsset] = useState({ file: null, preview: null });
  const [backgroundAsset, setBackgroundAsset] = useState({
    file: null,
    preview: null,
  });
  const [bgmTracks, setBgmTracks] = useState(() => createBgmStateFromHero(hero));
  const [previewBgmList, setPreviewBgmList] = useState([]);
  const [removedBgmIds, setRemovedBgmIds] = useState([]);
  const [activeBgmIndex, setActiveBgmIndex] = useState(0);
  const [isBgmPlaying, setIsBgmPlaying] = useState(false);
  const [trackTime, setTrackTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [trackProgress, setTrackProgress] = useState(0);
  const [rosterOwnerId, setRosterOwnerId] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterHeroes, setRosterHeroes] = useState([]);
  const [rosterError, setRosterError] = useState(null);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(null);
  const [blockedHeroes, setBlockedHeroes] = useState(() => readBlockedHeroes());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [friendOverlayOpen, setFriendOverlayOpen] = useState(false);

  useEffect(() => {
    setCurrentHero(hero ?? null);
    setEditDraft(createDraftFromHero(hero));
  }, [hero]);

  useEffect(() => {
    if (currentHero?.owner_id) {
      setRosterOwnerId(currentHero.owner_id);
      return;
    }

    if (typeof window !== "undefined") {
      const storedOwner = window.localStorage.getItem("selectedHeroOwnerId");
      if (storedOwner) {
        setRosterOwnerId(storedOwner);
      }
    }
  }, [currentHero?.owner_id]);

  useEffect(() => {
    const storedEnabled = readCookie(BGM_ENABLED_COOKIE);
    if (storedEnabled != null) {
      setBgmEnabled(storedEnabled !== "0");
    }

    const storedVolume = readCookie(BGM_VOLUME_COOKIE);
    if (storedVolume != null) {
      const parsed = Number.parseFloat(storedVolume);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.min(Math.max(parsed, 0), 1);
        setVolume(clamped);
      }
    }

    const storedPreset = readCookie(EQ_PRESET_COOKIE);
    if (storedPreset) {
      setEqPreset(storedPreset);
    }

    const storedEffects = readCookie(EFFECTS_COOKIE);
    if (storedEffects != null) {
      setEffectsEnabled(storedEffects !== "0");
    }

    const storedReverb = readCookie(REVERB_COOKIE);
    if (storedReverb != null) {
      const parsed = Number.parseFloat(storedReverb);
      setReverbLevel(clamp01(parsed));
    }

    const storedCompressor = readCookie(COMPRESSOR_COOKIE);
    if (storedCompressor != null) {
      const parsed = Number.parseFloat(storedCompressor);
      setCompressorLevel(clamp01(parsed));
    }

    const storedBands = readCookie(EQ_BANDS_COOKIE);
    if (storedBands) {
      try {
        const parsed = JSON.parse(storedBands);
        setEqBands((prev) => ({
          low: clamp(
            Number.parseFloat(parsed.low ?? prev.low),
            EQ_BAND_MIN,
            EQ_BAND_MAX,
          ),
          mid: clamp(
            Number.parseFloat(parsed.mid ?? prev.mid),
            EQ_BAND_MIN,
            EQ_BAND_MAX,
          ),
          high: clamp(
            Number.parseFloat(parsed.high ?? prev.high),
            EQ_BAND_MIN,
            EQ_BAND_MAX,
          ),
        }));
      } catch (error) {
        console.warn("Failed to parse EQ band cookie", error);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    persistBlockedHeroes(blockedHeroes);
  }, [blockedHeroes]);

  const heroName = useMemo(() => {
    if (!currentHero) return DEFAULT_HERO_NAME;
    const trimmed =
      typeof currentHero.name === "string" ? currentHero.name.trim() : "";
    return trimmed || DEFAULT_HERO_NAME;
  }, [currentHero]);

  const description = useMemo(() => {
    if (!currentHero) return DEFAULT_DESCRIPTION;
    const text =
      typeof currentHero.description === "string"
        ? currentHero.description.trim()
        : "";
    return text || DEFAULT_DESCRIPTION;
  }, [currentHero]);

  const abilityGroups = useMemo(() => {
    if (!currentHero) {
      return [];
    }

    const normalize = (value) =>
      typeof value === "string" ? value.trim() : "";
    const firstPair = [
      normalize(currentHero.ability1),
      normalize(currentHero.ability2),
    ].filter(Boolean);
    const secondPair = [
      normalize(currentHero.ability3),
      normalize(currentHero.ability4),
    ].filter(Boolean);

    const groups = [];
    if (firstPair.length) {
      groups.push({ label: "능력 1 & 2", entries: firstPair });
    }
    if (secondPair.length) {
      groups.push({ label: "능력 3 & 4", entries: secondPair });
    }

    return groups;
  }, [currentHero]);

  const infoSequence = useMemo(() => {
    const sequence = [];

    if (description) {
      sequence.push({
        key: "description",
        title: "설명",
        lines: [description],
      });
    }

    abilityGroups.forEach((group) => {
      sequence.push({
        key: group.label,
        title: group.label,
        lines: group.entries,
      });
    });

    return sequence;
  }, [abilityGroups, description]);

  const infoCount = infoSequence.length;

  const heroBgmList = useMemo(() => {
    if (previewBgmList.length) {
      return previewBgmList;
    }
    if (Array.isArray(currentHero?.bgms) && currentHero.bgms.length) {
      return currentHero.bgms;
    }
    if (currentHero?.bgm_url) {
      return [
        {
          id: null,
          hero_id: currentHero.id || null,
          label: "기본",
          url: currentHero.bgm_url,
          storage_path: null,
          duration_seconds: currentHero.bgm_duration_seconds ?? null,
          mime: currentHero.bgm_mime || null,
          sort_order: 0,
        },
      ];
    }
    return [];
  }, [
    currentHero?.bgms,
    currentHero?.bgm_duration_seconds,
    currentHero?.bgm_mime,
    currentHero?.bgm_url,
    currentHero?.id,
    previewBgmList,
  ]);

  const heroBgmCount = heroBgmList.length;
  const activeBgm =
    heroBgmCount > 0
      ? heroBgmList[Math.min(activeBgmIndex, heroBgmCount - 1)]
      : null;

  const currentEqPresetLabel = useMemo(() => {
    const found = eqPresets.find((preset) => preset.key === eqPreset);
    return found ? found.label : "플랫";
  }, [eqPreset]);

  const [viewMode, setViewMode] = useState(0);
  const [activeOverlay, setActiveOverlay] = useState("character");
  const [gameBrowserEnabled, setGameBrowserEnabled] = useState(false);

  const presencePage = useMemo(() => {
    if (activeOverlay === "search") return "character:game";
    if (activeOverlay === "ranking") return "character:ranking";
    if (activeOverlay === "settings") return "character:settings";
    if (activeOverlay === "roster") return "character:roster";
    return "character";
  }, [activeOverlay]);

  const viewerHeroHint = useMemo(
    () =>
      currentHero?.id
        ? {
            heroId: currentHero.id,
            heroName,
            avatarUrl: currentHero.image_url || null,
            ownerId: currentHero.owner_id || null,
          }
        : null,
    [currentHero?.id, currentHero?.image_url, currentHero?.owner_id, heroName],
  );

  const {
    viewer,
    friends,
    friendRequests,
    loading: friendsLoading,
    error: friendError,
    addFriend,
    removeFriend,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    refreshSocial,
    friendByHero,
  } = useHeroSocial({
    heroId: currentHero?.id || null,
    heroName,
    page: presencePage,
    viewerHero: viewerHeroHint,
  });

  const whisperTargets = useMemo(
    () =>
      Array.isArray(friends)
        ? friends
            .map((friend) => {
              const heroId = friend.currentHeroId || friend.friendHeroId;
              if (!heroId) return null;
              const name =
                friend.currentHeroName ||
                friend.friendHeroName ||
                "이름 미확인";
              return {
                heroId,
                heroName: name,
                username: name,
                avatarUrl:
                  friend.currentHeroAvatar || friend.friendHeroAvatar || null,
                ownerId: friend.friendOwnerId || null,
              };
            })
            .filter(Boolean)
        : [],
    [friends],
  );

  const {
    gameQuery,
    setGameQuery,
    gameSort,
    setGameSort,
    gameRows,
    gameLoading,
    selectedGame,
    setSelectedGame,
    detailLoading,
    gameRoles,
    participants,
    roleChoice,
    setRoleChoice,
    roleSlots,
  } = useGameBrowser({ enabled: gameBrowserEnabled });

  const isMobile = viewportWidth != null ? viewportWidth < 640 : false;

  useEffect(() => {
    setViewMode(0);
    setActiveOverlay("character");
  }, [currentHero?.id]);

  useEffect(() => {
    if (activeOverlay !== "settings") {
      setShowEditForm(false);
      setStatusMessage(null);
    }
  }, [activeOverlay]);

  useEffect(() => {
    if (activeOverlay !== "character") {
      setViewMode(0);
    }
  }, [activeOverlay]);

  useEffect(() => {
    setGameBrowserEnabled(activeOverlay === "search");
  }, [activeOverlay]);

  useEffect(() => {
    if (!friendOverlayOpen) return;
    refreshSocial();
  }, [friendOverlayOpen, refreshSocial]);

  useEffect(() => {
    setRosterHeroes([]);
    setRosterLoaded(false);
    setRosterError(null);
  }, [rosterOwnerId]);

  const audioContextRef = useRef(null);
  const audioRef = useRef(null);
  const audioGraphRef = useRef(null);
  const bgmAutoplayRef = useRef(true);
  const progressBarRef = useRef(null);
  const imageInputRef = useRef(null);
  const backgroundInputRef = useRef(null);
  const bgmInputRefs = useRef({});
  const quickBgmInputRef = useRef(null);
  const chatOverlayRef = useRef(null);

  useEffect(() => {
    setImageAsset({ file: null, preview: null });
    setBackgroundAsset({ file: null, preview: null });
    setBgmTracks(createBgmStateFromHero(currentHero));
    setPreviewBgmList([]);
    setRemovedBgmIds([]);
    setActiveBgmIndex(0);
    setTrackTime(0);
    setTrackDuration(0);
    setTrackProgress(0);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = "";
    }
    const inputMap = bgmInputRefs.current || {};
    Object.values(inputMap).forEach((input) => {
      if (input) {
        // eslint-disable-next-line no-param-reassign
        input.value = "";
      }
    });
  }, [currentHero?.id]);

  useEffect(() => {
    const playable = reindexBgmTracks([...bgmTracks])
      .map((track, index) => {
        const source = track.objectUrl || track.url;
        if (!source) return null;
        return {
          id: track.id || null,
          hero_id: currentHero?.id || null,
          label: normaliseBgmLabel(track.label, index),
          url: source,
          storage_path: track.storage_path || null,
          duration_seconds: Number.isFinite(track.duration)
            ? Math.max(0, Math.round(track.duration))
            : null,
          mime: track.mime || null,
          sort_order: index,
        };
      })
      .filter(Boolean);

    setPreviewBgmList((prev) => {
      if (
        prev.length === playable.length &&
        prev.every((entry, index) => {
          const next = playable[index];
          if (!entry && !next) return true;
          if (!entry || !next) return false;
          return (
            entry.url === next.url &&
            entry.label === next.label &&
            entry.mime === next.mime &&
            entry.duration_seconds === next.duration_seconds
          );
        })
      ) {
        return prev;
      }
      return playable;
    });
  }, [bgmTracks, currentHero?.id]);

  useEffect(() => {
    if (heroBgmCount === 0) {
      if (activeBgmIndex !== 0) {
        setActiveBgmIndex(0);
      }
      return;
    }
    if (activeBgmIndex >= heroBgmCount) {
      setActiveBgmIndex(heroBgmCount - 1);
    }
  }, [activeBgmIndex, heroBgmCount]);

  useEffect(
    () => () => {
      if (imageAsset.preview) {
        URL.revokeObjectURL(imageAsset.preview);
      }
    },
    [imageAsset.preview],
  );

  useEffect(
    () => () => {
      if (backgroundAsset.preview) {
        URL.revokeObjectURL(backgroundAsset.preview);
      }
    },
    [backgroundAsset.preview],
  );

  useEffect(
    () => () => {
      bgmTracks.forEach((track) => {
        if (track.objectUrl) {
          URL.revokeObjectURL(track.objectUrl);
        }
      });
    },
    [bgmTracks],
  );
  useEffect(() => {
    const trackUrl = activeBgm?.url;
    const fallbackDuration =
      Number.isFinite(activeBgm?.duration_seconds) && activeBgm.duration_seconds > 0
        ? activeBgm.duration_seconds
        : 0;

    if (!trackUrl) {
      if (audioGraphRef.current) {
        disconnectAudioGraph(audioGraphRef.current);
        audioGraphRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      setIsBgmPlaying(false);
      setTrackTime(0);
      setTrackDuration(0);
      setTrackProgress(0);
      return;
    }

    if (audioGraphRef.current) {
      disconnectAudioGraph(audioGraphRef.current);
      audioGraphRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    const audio = new Audio(trackUrl);
    audio.loop = false;
    audio.volume = volume;
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    setTrackTime(0);
    setTrackDuration(fallbackDuration || 0);
    setTrackProgress(0);

    const handlePlay = () => {
      setIsBgmPlaying(true);
    };

    const handlePause = () => {
      setIsBgmPlaying(false);
    };

    const handleLoadedMetadata = () => {
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : fallbackDuration;
      setTrackDuration(duration || 0);
    };

    const handleTimeUpdate = () => {
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : fallbackDuration;
      setTrackTime(audio.currentTime);
      if (duration > 0) {
        setTrackProgress(Math.min(1, audio.currentTime / duration));
      } else {
        setTrackProgress(0);
      }
    };

    const handleEnded = () => {
      setIsBgmPlaying(false);
      setTrackTime(0);
      setTrackProgress(0);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    if (typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }

        try {
          const context = audioContextRef.current;
          const graph = createAudioProcessingGraph(context, audio);
          audioGraphRef.current = graph;

          const applyEq = effectsEnabled ? eqBands : { low: 0, mid: 0, high: 0 };
          graph.low.gain.value = applyEq.low;
          graph.mid.gain.value = applyEq.mid;
          graph.high.gain.value = applyEq.high;

          const mix = effectsEnabled ? clamp01(reverbLevel) : 0;
          graph.wetGain.gain.value = mix;
          graph.dryGain.gain.value = 1 - mix * 0.55;

          const intensity = effectsEnabled ? clamp01(compressorLevel) : 0;
          graph.compressor.threshold.value = -12 - intensity * 24;
          graph.compressor.knee.value = 30 - intensity * 15;
          graph.compressor.ratio.value = 1 + intensity * 19;
          graph.compressor.attack.value = 0.003 + intensity * 0.047;
          graph.compressor.release.value = 0.25 + intensity * 0.45;
        } catch (error) {
          console.warn("Failed to initialize character audio graph", error);
        }
      }
    }

    const startPlayback = async () => {
      if (!bgmEnabled || !bgmAutoplayRef.current) {
        return;
      }
      try {
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume().catch(() => {});
        }
        await audio.play();
      } catch (error) {
        console.warn("Failed to autoplay character BGM", error);
      }
    };

    startPlayback();

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);

      if (audioGraphRef.current?.element === audio) {
        disconnectAudioGraph(audioGraphRef.current);
        audioGraphRef.current = null;
      }
      audio.pause();
      audio.currentTime = 0;
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [activeBgm?.duration_seconds, activeBgm?.url]); // eslint-disable-line react-hooks-exhaustive-deps

  useEffect(() => {
    const graph = audioGraphRef.current;
    if (!graph) return;

    const applyEq = effectsEnabled ? eqBands : { low: 0, mid: 0, high: 0 };
    graph.low.gain.value = applyEq.low;
    graph.mid.gain.value = applyEq.mid;
    graph.high.gain.value = applyEq.high;
  }, [eqBands.low, eqBands.mid, eqBands.high, effectsEnabled]);

  useEffect(() => {
    const graph = audioGraphRef.current;
    if (!graph) return;

    const mix = effectsEnabled ? clamp01(reverbLevel) : 0;
    graph.wetGain.gain.value = mix;
    graph.dryGain.gain.value = 1 - mix * 0.55;
  }, [reverbLevel, effectsEnabled]);

  useEffect(() => {
    const graph = audioGraphRef.current;
    if (!graph) return;

    const intensity = effectsEnabled ? clamp01(compressorLevel) : 0;
    graph.compressor.threshold.value = -12 - intensity * 24;
    graph.compressor.knee.value = 30 - intensity * 15;
    graph.compressor.ratio.value = 1 + intensity * 19;
    graph.compressor.attack.value = 0.003 + intensity * 0.047;
    graph.compressor.release.value = 0.25 + intensity * 0.45;
  }, [compressorLevel, effectsEnabled]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (bgmEnabled) {
      if (!bgmAutoplayRef.current) {
        return;
      }

      const resumeContext = () => {
        if (audioContextRef.current?.state === "suspended") {
          return audioContextRef.current.resume();
        }
        return Promise.resolve();
      };

      resumeContext()
        .catch((error) => {
          console.warn("Failed to resume audio context", error);
        })
        .finally(() => {
          if (!bgmAutoplayRef.current || audioRef.current !== audio) {
            return;
          }
          audio
            .play()
            .catch((error) =>
              console.warn("Failed to resume BGM playback", error),
            );
        });
    } else {
      bgmAutoplayRef.current = false;
      audio.pause();
    }
  }, [bgmEnabled]);

  const showBgmBar = bgmEnabled;
  const hasActiveTrack = heroBgmCount > 0 && Boolean(activeBgm?.url);
  useEffect(() => {
    if (!showBgmBar) {
      setBgmBarCollapsed(false);
    }
  }, [showBgmBar]);
  const formattedCurrentTime = formatPlaybackTime(trackTime);
  const hasKnownDuration = Number.isFinite(trackDuration) && trackDuration > 0;
  const formattedDuration = hasKnownDuration
    ? formatPlaybackTime(trackDuration)
    : hasActiveTrack
      ? "??:??"
      : "0:00";
  const trackProgressPercent = `${Math.min(100, Math.max(0, trackProgress * 100))}%`;

  const backgroundStyle = useMemo(() => {
    const baseStyle = currentHero?.background_url
      ? pageStyles.withBackground(currentHero.background_url)
      : pageStyles.base;
    if (!isMobile) {
      return baseStyle;
    }
    return { ...baseStyle, padding: "20px 14px 220px" };
  }, [currentHero?.background_url, isMobile]);

  const stageStyle = useMemo(
    () => ({
      ...styles.stage,
      gap: isMobile ? 32 : 48,
    }),
    [isMobile],
  );

  const heroCardStyle = useMemo(
    () => ({
      ...styles.heroCard,
      paddingTop: isMobile ? "140%" : "160%",
      borderRadius: isMobile ? 28 : 36,
    }),
    [isMobile],
  );

  const heroImageStyle = useMemo(
    () => ({
      ...styles.heroImage,
      filter: viewMode === 0 ? "none" : "brightness(0.6)",
    }),
    [viewMode],
  );

  const heroNameOverlayStyle = useMemo(
    () => ({
      ...styles.heroNameOverlay,
      padding: isMobile ? "0 22px 40px" : "0 32px 52px",
    }),
    [isMobile],
  );

  const heroNameBadgeStyle = useMemo(
    () => ({
      ...styles.heroNameBadge,
      fontSize: isMobile ? 28 : 32,
    }),
    [isMobile],
  );

  const heroInfoOverlayStyle = useMemo(
    () => ({
      ...styles.heroInfoOverlay,
      padding: isMobile ? "20px 22px 36px" : "24px 32px 48px",
      maxHeight: isMobile ? "68%" : "72%",
    }),
    [isMobile],
  );

  const overlayContainerStyle = useMemo(() => {
    const base = { ...styles.overlayContainer };
    if (isMobile) {
      base.bottom = 10;
      base.width = "calc(100vw - 24px)";
      base.gap = 6;
    }
    return base;
  }, [isMobile]);

  const overlayPanelStyle = useMemo(() => {
    const base = { ...styles.overlayPanel };
    if (isMobile) {
      base.padding = "12px 14px 16px";
      base.gap = 8;
      base.borderRadius = 18;
    }
    return base;
  }, [isMobile]);

  const overlayContentStyle = useMemo(
    () => ({
      ...styles.overlayContent,
      maxHeight: isMobile ? "52vh" : "46vh",
    }),
    [isMobile],
  );

  const settingsPanelStyle = useMemo(
    () => ({
      ...styles.settingsPanel,
      gap: isMobile ? 12 : 14,
    }),
    [isMobile],
  );

  const settingsSectionStyle = useMemo(
    () => ({
      ...styles.settingsSection,
      ...(isMobile ? { padding: "10px 12px", gap: 8 } : {}),
    }),
    [isMobile],
  );

  const gameSearchLayoutStyle = useMemo(
    () => ({
      ...styles.gameSearchLayout,
      flexDirection: isMobile ? "column" : "row",
    }),
    [isMobile],
  );

  const gameListSectionStyle = useMemo(
    () => ({
      ...styles.gameSearchListSection,
      maxHeight: isMobile ? 260 : 320,
      flex: isMobile ? "1 1 auto" : "0 0 42%",
    }),
    [isMobile],
  );

  const gameDetailSectionStyle = useMemo(
    () => ({
      ...styles.gameSearchDetailSection,
      minHeight: isMobile ? 220 : 280,
      padding: isMobile ? 12 : 14,
    }),
    [isMobile],
  );

  const currentInfo = viewMode > 0 ? infoSequence[viewMode - 1] : null;

  const incomingRequestCount = useMemo(() => {
    if (!friendRequests || !Array.isArray(friendRequests.incoming)) {
      return 0;
    }
    return friendRequests.incoming.length;
  }, [friendRequests]);

  const showChatLauncher = activeOverlay === "character";
  const chatBadgeLabel = chatUnread > 99 ? "99+" : chatUnread;
  const requestBadgeLabel =
    incomingRequestCount > 99 ? "99+" : incomingRequestCount;

  const handleTap = useCallback(() => {
    if (activeOverlay !== "character") return;
    if (infoCount === 0) return;

    setViewMode((prev) => (prev + 1) % (infoCount + 1));
  }, [activeOverlay, infoCount]);

  const handleKeyUp = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleTap();
      }
    },
    [handleTap],
  );

  const loadRoster = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!force && rosterLoading) {
        return null;
      }

      if (!rosterOwnerId) {
        setRosterHeroes([]);
        setRosterLoaded(true);
        setRosterError(null);
        return [];
      }

      if (!silent) {
        setRosterLoading(true);
      }
      setRosterError(null);

      try {
        const heroesList = await fetchHeroesByOwner(rosterOwnerId);
        setRosterHeroes(heroesList);
        setRosterLoaded(true);
        setRosterError(null);
        return heroesList;
      } catch (error) {
        console.error("Failed to load roster heroes", error);
        setRosterError("로스터를 불러오지 못했습니다. 다시 시도해 주세요.");
        return null;
      } finally {
        setRosterLoading(false);
      }
    },
    [rosterLoading, rosterOwnerId],
  );

  useEffect(() => {
    if (activeOverlay !== "roster") return;
    if (rosterLoaded) return;
    loadRoster();
  }, [activeOverlay, rosterLoaded, loadRoster]);

  const handleOverlayButton = useCallback((key) => {
    setActiveOverlay((prev) => (prev === key ? "character" : key));
  }, []);

  const handleDockAction = useCallback((key) => {
    if (key === "battle") {
      if (typeof window !== "undefined") {
        window.alert("빠른 전투 매칭 시스템을 준비 중입니다!");
      }
    }
  }, []);

  const handleChatUnreadChange = useCallback((count) => {
    if (typeof count !== "number" || Number.isNaN(count)) {
      setChatUnread(0);
      return;
    }
    setChatUnread(Math.max(0, Math.floor(count)));
  }, []);

  const handleBlockedHeroesChange = useCallback((list) => {
    setBlockedHeroes(normaliseBlockedHeroes(list));
  }, []);

  const handleToggleBlockedHero = useCallback((heroId) => {
    if (!heroId) {
      return { ok: false, error: "영웅 정보를 찾을 수 없습니다." };
    }
    setBlockedHeroes((prev) => {
      const next = new Set(prev);
      if (next.has(heroId)) {
        next.delete(heroId);
      } else {
        next.add(heroId);
      }
      return Array.from(next);
    });
    return { ok: true };
  }, []);

  const handleOpenChat = useCallback(() => {
    chatOverlayRef.current?.resetThread?.();
    setChatOpen(true);
  }, []);

  const handleCloseChat = useCallback(() => {
    setChatOpen(false);
    chatOverlayRef.current?.resetThread?.();
  }, []);

  const handleOpenWhisper = useCallback((heroId) => {
    if (!heroId) return;
    setChatOpen(true);
    setTimeout(() => {
      chatOverlayRef.current?.openThread?.(heroId);
    }, 0);
  }, []);

  const handleOpenFriendOverlay = useCallback(() => {
    setFriendOverlayOpen(true);
  }, []);

  const handleCloseFriendOverlay = useCallback(() => {
    setFriendOverlayOpen(false);
  }, []);

  const handleRequestAddFriend = useCallback(
    (heroMeta) => {
      const heroId = heroMeta?.heroId || heroMeta?.id || null;
      if (!heroId) {
        return Promise.resolve({
          ok: false,
          error: "영웅 정보를 찾을 수 없습니다.",
        });
      }
      return addFriend({ heroId });
    },
    [addFriend],
  );

  const handleRequestRemoveFriend = useCallback(
    (heroMeta) => {
      const heroId = heroMeta?.heroId || heroMeta?.id || null;
      if (!heroId) {
        return Promise.resolve({
          ok: false,
          error: "영웅 정보를 찾을 수 없습니다.",
        });
      }
      const friend = friendByHero?.get?.(heroId);
      if (!friend) {
        return Promise.resolve({
          ok: false,
          error: "이미 친구가 아닙니다.",
        });
      }
      return removeFriend(friend);
    },
    [friendByHero, removeFriend],
  );

  const handleBgmToggle = useCallback(() => {
    setBgmEnabled((prev) => {
      const next = !prev;
      writeCookie(BGM_ENABLED_COOKIE, next ? "1" : "0");
      if (!next) {
        bgmAutoplayRef.current = false;
        if (audioRef.current) {
          audioRef.current.pause();
        }
      } else {
        bgmAutoplayRef.current = true;
      }
      return next;
    });
  }, []);

  const handleBgmPlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      bgmAutoplayRef.current = true;
      audio
        .play()
        .catch((error) => console.warn("Failed to resume BGM playback", error));
    } else {
      bgmAutoplayRef.current = false;
      audio.pause();
    }
  }, []);

  const handleBgmStop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    bgmAutoplayRef.current = false;
    audio.pause();
    audio.currentTime = 0;
    setTrackTime(0);
    setTrackProgress(0);
  }, []);

  const handleBgmRestart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setTrackTime(0);
    setTrackProgress(0);
    if (!audio.paused) {
      audio
        .play()
        .catch((error) => console.warn("Failed to restart BGM", error));
    }
  }, []);

  const handleOverlayToggle = useCallback(() => {
    setOverlayCollapsed((prev) => !prev);
  }, []);

  const handleToggleBgmBar = useCallback(() => {
    setBgmBarCollapsed((prev) => !prev);
  }, []);

  const handleRoleSelect = useCallback(
    (roleName) => {
      if (!roleName) {
        setRoleChoice("");
        return;
      }
      setRoleChoice((prev) => (prev === roleName ? "" : roleName));
    },
    [setRoleChoice],
  );

  const handleEnterGame = useCallback(
    (game, roleName) => {
      if (!game) return;
      const base = `/rank/${game.id}`;
      const target = roleName
        ? `${base}?role=${encodeURIComponent(roleName)}`
        : base;
      router.push(target);
    },
    [router],
  );

  const seekToClientX = useCallback(
    (clientX) => {
      if (!progressBarRef.current || !audioRef.current) return;
      if (typeof clientX !== "number" || Number.isNaN(clientX)) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = clamp01((clientX - rect.left) / rect.width);
      const audio = audioRef.current;
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : trackDuration;
      if (duration > 0) {
        audio.currentTime = ratio * duration;
        setTrackProgress(ratio);
      }
      setTrackTime(audio.currentTime);
    },
    [trackDuration],
  );

  const handleProgressMouseDown = useCallback(
    (event) => {
      if (!progressBarRef.current) return;
      if (typeof event.button === "number" && event.button !== 0) {
        return;
      }
      event.preventDefault();
      seekToClientX(event.clientX);

      const handleMove = (moveEvent) => {
        moveEvent.preventDefault();
        seekToClientX(moveEvent.clientX);
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp, { once: true });
    },
    [seekToClientX],
  );

  const handleProgressTouchStart = useCallback(
    (event) => {
      if (!progressBarRef.current) return;
      if (!event.touches || event.touches.length === 0) return;
      event.preventDefault();

      const applyFromTouch = (touchEvent) => {
        const touch = touchEvent.touches?.[0] || touchEvent.changedTouches?.[0];
        if (!touch) return;
        seekToClientX(touch.clientX);
      };

      const handleMove = (moveEvent) => {
        moveEvent.preventDefault();
        applyFromTouch(moveEvent);
      };

      const handleEnd = () => {
        window.removeEventListener("touchmove", handleMove);
        window.removeEventListener("touchend", handleEnd);
        window.removeEventListener("touchcancel", handleEnd);
      };

      applyFromTouch(event);
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", handleEnd, { once: true });
      window.addEventListener("touchcancel", handleEnd, { once: true });
    },
    [seekToClientX],
  );

  const handleProgressKeyDown = useCallback(
    (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : trackDuration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      event.preventDefault();
      const step = Math.max(1, duration * 0.02);
      if (event.key === "ArrowLeft") {
        const nextTime = Math.max(0, audio.currentTime - step);
        audio.currentTime = nextTime;
        setTrackTime(nextTime);
        setTrackProgress(Math.min(1, nextTime / duration));
      } else if (event.key === "ArrowRight") {
        const nextTime = Math.min(duration, audio.currentTime + step);
        audio.currentTime = nextTime;
        setTrackTime(nextTime);
        setTrackProgress(Math.min(1, nextTime / duration));
      }
    },
    [trackDuration],
  );

  const handleVolumeChange = useCallback((event) => {
    const nextValue = Number.parseFloat(event.target.value);
    if (Number.isNaN(nextValue)) return;
    const clamped = Math.min(Math.max(nextValue, 0), 1);
    setVolume(clamped);
    writeCookie(BGM_VOLUME_COOKIE, String(clamped));
  }, []);

  const handleEqSelect = useCallback((presetKey) => {
    setEqPreset(presetKey);
    writeCookie(EQ_PRESET_COOKIE, presetKey);
  }, []);

  const handleEffectsToggle = useCallback(() => {
    setEffectsEnabled((prev) => {
      const next = !prev;
      writeCookie(EFFECTS_COOKIE, next ? "1" : "0");
      return next;
    });
  }, []);

  const handleReverbChange = useCallback((event) => {
    const nextValue = Number.parseFloat(event.target.value);
    const clamped = clamp01(nextValue);
    setReverbLevel(clamped);
    writeCookie(REVERB_COOKIE, String(clamped));
  }, []);

  const handleCompressorChange = useCallback((event) => {
    const nextValue = Number.parseFloat(event.target.value);
    const clamped = clamp01(nextValue);
    setCompressorLevel(clamped);
    writeCookie(COMPRESSOR_COOKIE, String(clamped));
  }, []);

  const handleEqBandChange = useCallback((band, value) => {
    const numeric = Number.parseFloat(value);
    const clamped = clamp(numeric, EQ_BAND_MIN, EQ_BAND_MAX);
    setEqBands((prev) => {
      const nextBands = { ...prev, [band]: clamped };
      writeCookie(EQ_BANDS_COOKIE, JSON.stringify(nextBands));
      return nextBands;
    });
  }, []);

  const handleRosterRefresh = useCallback(() => {
    loadRoster({ force: true });
  }, [loadRoster]);

  const handleRosterHeroSelect = useCallback(
    (heroId) => {
      if (!heroId) return;
      if (heroId === currentHero?.id) {
        setActiveOverlay("character");
        return;
      }

      const navigate = async () => {
        try {
          await router.push(`/character/${heroId}`);
          setActiveOverlay("character");
        } catch (error) {
          console.error("Failed to open roster hero", error);
        }
      };

      navigate();
    },
    [currentHero?.id, router],
  );

  const handleImageFileSelect = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const previewUrl = URL.createObjectURL(file);
      setImageAsset({ file, preview: previewUrl });
      setStatusMessage(null);
    },
    [setStatusMessage],
  );

  const handleClearImage = useCallback(() => {
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    setImageAsset({ file: null, preview: null });
    setEditDraft((prev) => ({ ...prev, image_url: "" }));
    setStatusMessage(null);
  }, [setEditDraft, setStatusMessage]);

  const handleBackgroundFileSelect = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const previewUrl = URL.createObjectURL(file);
      setBackgroundAsset({ file, preview: previewUrl });
      setStatusMessage(null);
    },
    [setStatusMessage],
  );

  const handleClearBackground = useCallback(() => {
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = "";
    }
    setBackgroundAsset({ file: null, preview: null });
    setEditDraft((prev) => ({ ...prev, background_url: "" }));
    setStatusMessage(null);
  }, [setEditDraft, setStatusMessage]);

  const handleAddBgmTrack = useCallback(() => {
    setBgmTracks((prev) => {
      if (prev.length >= MAX_BGM_TRACKS) {
        return prev;
      }
      const next = [...prev, createBgmDraftFromRecord(null, prev.length)];
      return reindexBgmTracks(next);
    });
    setStatusMessage(null);
  }, []);

  const handleBgmLabelChange = useCallback((trackId, value) => {
    setBgmTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, label: value } : track,
      ),
    );
  }, []);

  const applyBgmFileToTrack = useCallback(
    (trackId, file) => {
      if (!file) return;

      const objectUrl = URL.createObjectURL(file);
      setBgmTracks((prev) => {
        const next = prev.length ? [...prev] : [];
        let index = next.findIndex((track) => track.id === trackId);
        if (index === -1) {
          next.push(createBgmDraftFromRecord(null, next.length));
          index = next.length - 1;
        }

        const target = next[index];
        if (target.objectUrl) {
          URL.revokeObjectURL(target.objectUrl);
        }

        const updated = {
          ...target,
          id: target.id || trackId,
          label: normaliseBgmLabel(target.label, index),
          file,
          objectUrl,
          url: objectUrl,
          duration: null,
          mime: file.type || target.mime || null,
          storage_path: null,
          error: null,
        };

        next[index] = updated;
        return reindexBgmTracks(next);
      });
      setStatusMessage(null);
      setBgmEnabled(true);
      setBgmBarCollapsed(false);
      bgmAutoplayRef.current = true;
      setActiveBgmIndex(0);
      setTrackTime(0);
      setTrackDuration(0);
      setTrackProgress(0);

      const audioEl = document.createElement("audio");
      audioEl.preload = "metadata";
      audioEl.src = objectUrl;

      const cleanup = () => {
        audioEl.removeEventListener("loadedmetadata", handleLoaded);
        audioEl.removeEventListener("error", handleError);
      };

      const handleLoaded = () => {
        const durationSeconds = Number.isFinite(audioEl.duration)
          ? Math.max(0, Math.round(audioEl.duration))
          : null;
        setBgmTracks((prev) =>
          prev.map((track) => {
            if (track.id !== trackId || track.file !== file) return track;
            return { ...track, duration: durationSeconds, error: null };
          }),
        );
        cleanup();
      };

      const handleError = () => {
        setBgmTracks((prev) =>
          prev.map((track) => {
            if (track.id !== trackId || track.file !== file) return track;
            return {
              ...track,
              error: "오디오 파일을 불러올 수 없습니다.",
            };
          }),
        );
        cleanup();
      };

      audioEl.addEventListener("loadedmetadata", handleLoaded);
      audioEl.addEventListener("error", handleError);
    },
    [setStatusMessage, setBgmEnabled, setBgmBarCollapsed],
  );

  const handleBgmFileSelect = useCallback(
    (trackId) => (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      applyBgmFileToTrack(trackId, file);
    },
    [applyBgmFileToTrack],
  );

  const handleClearBgmFile = useCallback((trackId) => {
    setBgmTracks((prev) =>
      prev.map((track) => {
        if (track.id !== trackId) return track;
        if (track.objectUrl) {
          URL.revokeObjectURL(track.objectUrl);
        }
        return {
          ...track,
          file: null,
          objectUrl: null,
          duration: track.url ? track.duration : null,
          url: "",
          mime: track.mime,
          storage_path: null,
          error: null,
        };
      }),
    );
    const inputNode = bgmInputRefs.current?.[trackId];
    if (inputNode) {
      inputNode.value = "";
    }
    setStatusMessage(null);
  }, []);

  const handleRemoveBgmTrack = useCallback(
    (trackId, { skipConfirm = false } = {}) => {
      const target = bgmTracks.find((track) => track.id === trackId);
      if (!target) return;
      const confirmed = skipConfirm
        ? true
        : typeof window !== "undefined"
          ? window.confirm("이 브금을 목록에서 삭제할까요?")
          : true;
      if (!confirmed) return;

      if (target.objectUrl) {
        URL.revokeObjectURL(target.objectUrl);
      }

      setBgmTracks((prev) => {
        const filtered = prev.filter((track) => track.id !== trackId);
        return reindexBgmTracks(filtered);
      });

      if (!target.isNew && target.id) {
        setRemovedBgmIds((prev) => {
          if (prev.includes(target.id)) return prev;
          return [...prev, target.id];
        });
      }

      if (bgmInputRefs.current?.[trackId]) {
        bgmInputRefs.current[trackId].value = "";
      }
      delete bgmInputRefs.current?.[trackId];
      setStatusMessage(null);
    },
    [bgmTracks],
  );

  const handleQuickBgmButtonClick = useCallback(() => {
    if (!currentHero?.id) {
      setStatusMessage({
        type: "error",
        text: "브금을 교체할 캐릭터를 찾을 수 없습니다.",
      });
      return;
    }
    if (!quickBgmInputRef.current) return;
    quickBgmInputRef.current.value = "";
    quickBgmInputRef.current.click();
  }, [currentHero?.id, setStatusMessage]);

  const handleQuickBgmFileInput = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!currentHero?.id) {
        setStatusMessage({
          type: "error",
          text: "브금을 교체할 캐릭터를 찾을 수 없습니다.",
        });
        if (quickBgmInputRef.current) {
          quickBgmInputRef.current.value = "";
        }
        return;
      }

      setSavingHero(true);
      setStatusMessage(null);

      try {
        const durationSeconds = await readAudioDurationFromFile(file);
        const existingLabel = heroBgmList[0]?.label;
        const label = normaliseBgmLabel(existingLabel, 0);
        const baseName = sanitizeFileName(
          editDraft.name || currentHero.name || DEFAULT_HERO_NAME,
        );
        const extension =
          (file.type && file.type.split("/")[1]) ||
          file.name?.split(".").pop() ||
          "mp3";
        const safeLabel = sanitizeFileName(label) || "bgm-1";
        const path = `hero-bgm/${Date.now()}-${currentHero.id}-${baseName}-${safeLabel}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(HERO_STORAGE_BUCKET)
          .upload(path, file, {
            upsert: true,
            contentType: file.type || "audio/mpeg",
          });

        if (uploadError) {
          throw uploadError;
        }

        const publicUrl = supabase.storage
          .from(HERO_STORAGE_BUCKET)
          .getPublicUrl(path).data.publicUrl;
        const mime = file.type || "audio/mpeg";

        const keepId = isValidUuid(heroBgmList[0]?.id)
          ? heroBgmList[0].id
          : undefined;

        const processedTrack = {
          id: keepId,
          label,
          url: publicUrl,
          storage_path: path,
          duration_seconds: Number.isFinite(durationSeconds)
            ? durationSeconds
            : null,
          mime,
          sort_order: 0,
        };

        await updateHeroById(currentHero.id, {
          bgm_url: processedTrack.url,
          bgm_duration_seconds: processedTrack.duration_seconds,
          bgm_mime: processedTrack.mime,
        });

        const removalIds = heroBgmList
          .map((track) => track?.id)
          .filter(isValidUuid)
          .filter((id) => id !== processedTrack.id);

        const freshBgms = await syncHeroBgms(currentHero.id, {
          upserts: [processedTrack],
          removals: removalIds,
        });

        const heroWithBgm = {
          ...currentHero,
          bgms: freshBgms,
          bgm_url: processedTrack.url,
          bgm_duration_seconds:
            processedTrack.duration_seconds ?? null,
          bgm_mime: processedTrack.mime,
        };

        setCurrentHero(heroWithBgm);
        setEditDraft(createDraftFromHero(heroWithBgm));
        setBgmTracks(createBgmStateFromHero(heroWithBgm));
        setRemovedBgmIds([]);
        setPreviewBgmList(freshBgms);
        setActiveBgmIndex(0);
        setTrackTime(0);
        setTrackDuration(Number.isFinite(durationSeconds) ? durationSeconds : 0);
        setTrackProgress(0);
        setIsBgmPlaying(false);
        bgmAutoplayRef.current = true;
        setBgmEnabled(true);
        setBgmBarCollapsed(false);
        handleBgmStop();
        await loadRoster({ silent: true, force: true });

        setStatusMessage({
          type: "success",
          text: "브금을 교체하고 저장했습니다.",
        });
      } catch (error) {
        console.error("Failed to replace BGM", error);
        const message =
          error?.message || "브금을 교체하지 못했습니다. 잠시 후 다시 시도해 주세요.";
        setStatusMessage({ type: "error", text: message });
      } finally {
        setSavingHero(false);
        if (quickBgmInputRef.current) {
          quickBgmInputRef.current.value = "";
        }
      }
    },
    [
      currentHero,
      editDraft.name,
      heroBgmList,
      handleBgmStop,
      loadRoster,
      setBgmBarCollapsed,
      setBgmEnabled,
      setStatusMessage,
      setTrackDuration,
    ],
  );

  const handleDraftChange = useCallback((field, value) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleResetDraft = useCallback(() => {
    setEditDraft(createDraftFromHero(currentHero));
    setStatusMessage(null);
    setImageAsset({ file: null, preview: null });
    setBackgroundAsset({ file: null, preview: null });
    setBgmTracks(createBgmStateFromHero(currentHero));
    setRemovedBgmIds([]);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = "";
    }
    const inputMap = bgmInputRefs.current || {};
    Object.values(inputMap).forEach((input) => {
      if (input) {
        // eslint-disable-next-line no-param-reassign
        input.value = "";
      }
    });
  }, [currentHero]);

  const handleSaveDraft = useCallback(async () => {
    if (!currentHero?.id) {
      setStatusMessage({
        type: "error",
        text: "영웅 정보를 불러오지 못했습니다.",
      });
      return;
    }

    setSavingHero(true);
    setStatusMessage(null);
    try {
      const payload = { ...editDraft };
      const baseName = sanitizeFileName(
        editDraft.name || currentHero.name || DEFAULT_HERO_NAME,
      );

      const orderedTracks = reindexBgmTracks([...bgmTracks]);
      const preparedTracks = orderedTracks.filter(
        (track) => track.file || track.url,
      );

      const processedTracks = [];

      for (let index = 0; index < preparedTracks.length; index += 1) {
        const track = preparedTracks[index];
        const label = normaliseBgmLabel(track.label, index);
        let finalUrl = track.url;
        let finalMime = track.mime || null;
        let finalDuration = Number.isFinite(track.duration)
          ? Math.max(0, Math.round(track.duration))
          : null;
        let storagePath = track.storage_path || null;

        if (track.file) {
          const extension =
            (track.file.type && track.file.type.split("/")[1]) ||
            track.file.name?.split(".").pop() ||
            "mp3";
          const safeLabel = sanitizeFileName(label) || `bgm-${index + 1}`;
          const path = `hero-bgm/${Date.now()}-${track.id}-${baseName}-${safeLabel}.${extension}`;
          const { error: bgmError } = await supabase.storage
            .from(HERO_STORAGE_BUCKET)
            .upload(path, track.file, {
              upsert: true,
              contentType: track.file.type || "audio/mpeg",
            });
          if (bgmError) throw bgmError;
          finalUrl = supabase.storage
            .from(HERO_STORAGE_BUCKET)
            .getPublicUrl(path).data.publicUrl;
          finalMime = track.file.type || finalMime || "audio/mpeg";
          if (track.duration == null || Number.isNaN(track.duration)) {
            finalDuration = null;
          }
          storagePath = path;
        }

        if (!finalUrl) {
          throw new Error("브금 파일을 준비하지 못했습니다. 다시 시도해 주세요.");
        }

        processedTracks.push({
          id: isValidUuid(track.id) ? track.id : undefined,
          label,
          url: finalUrl,
          storage_path: storagePath,
          duration_seconds: finalDuration,
          mime: finalMime,
          sort_order: index,
        });
      }

      if (imageAsset.file) {
        const extension =
          (imageAsset.file.type && imageAsset.file.type.split("/")[1]) ||
          imageAsset.file.name?.split(".").pop() ||
          "jpg";
        const path = `hero-image/${Date.now()}-${baseName}.${extension}`;
        const { error: imageError } = await supabase.storage
          .from(HERO_STORAGE_BUCKET)
          .upload(path, imageAsset.file, {
            upsert: true,
            contentType: imageAsset.file.type || "image/jpeg",
          });
        if (imageError) throw imageError;
        payload.image_url = supabase.storage
          .from(HERO_STORAGE_BUCKET)
          .getPublicUrl(path).data.publicUrl;
      }

      if (backgroundAsset.file) {
        const extension =
          (backgroundAsset.file.type &&
            backgroundAsset.file.type.split("/")[1]) ||
          backgroundAsset.file.name?.split(".").pop() ||
          "jpg";
        const path = `hero-background/${Date.now()}-${baseName}.${extension}`;
        const { error: backgroundError } = await supabase.storage
          .from(HERO_STORAGE_BUCKET)
          .upload(path, backgroundAsset.file, {
            upsert: true,
            contentType: backgroundAsset.file.type || "image/jpeg",
          });
        if (backgroundError) throw backgroundError;
        payload.background_url = supabase.storage
          .from(HERO_STORAGE_BUCKET)
          .getPublicUrl(path).data.publicUrl;
      }

      if (processedTracks.length) {
        const primary = processedTracks[0];
        payload.bgm_url = primary.url || null;
        payload.bgm_duration_seconds = primary.duration_seconds ?? null;
        payload.bgm_mime = primary.mime || null;
      } else {
        payload.bgm_url = null;
        payload.bgm_duration_seconds = null;
        payload.bgm_mime = null;
      }

      if (!payload.image_url) {
        payload.image_url = null;
      }
      if (!payload.background_url) {
        payload.background_url = null;
      }

      const updatedHero = await updateHeroById(currentHero.id, payload);
      const freshBgms = await syncHeroBgms(currentHero.id, {
        upserts: processedTracks,
        removals: removedBgmIds,
      });

      const heroWithBgm = { ...updatedHero, bgms: freshBgms };
      if (freshBgms.length) {
        const [primary] = freshBgms;
        heroWithBgm.bgm_url = primary?.url || heroWithBgm.bgm_url || null;
        heroWithBgm.bgm_duration_seconds =
          primary?.duration_seconds ?? heroWithBgm.bgm_duration_seconds ?? null;
        heroWithBgm.bgm_mime = primary?.mime || heroWithBgm.bgm_mime || null;
      } else {
        heroWithBgm.bgm_url = null;
        heroWithBgm.bgm_duration_seconds = null;
        heroWithBgm.bgm_mime = null;
      }

      setCurrentHero(heroWithBgm);
      setEditDraft(createDraftFromHero(heroWithBgm));
      setBgmTracks(createBgmStateFromHero(heroWithBgm));
      setRemovedBgmIds([]);

      await loadRoster({ silent: true, force: true });
      setStatusMessage({
        type: "success",
        text: "캐릭터 정보를 저장했습니다.",
      });
      router.replace(router.asPath);
      setImageAsset({ file: null, preview: null });
      setBackgroundAsset({ file: null, preview: null });
      const inputMap = bgmInputRefs.current || {};
      Object.values(inputMap).forEach((input) => {
        if (input) {
          // eslint-disable-next-line no-param-reassign
          input.value = "";
        }
      });
    } catch (error) {
      console.error("Failed to update hero", error);
      const message =
        error?.message || "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      setStatusMessage({ type: "error", text: message });
    } finally {
      setSavingHero(false);
    }
  }, [
    backgroundAsset.file,
    bgmTracks,
    currentHero,
    editDraft,
    imageAsset.file,
    loadRoster,
    removedBgmIds,
    router,
  ]);

  const handleDeleteHero = useCallback(async () => {
    if (!currentHero?.id) {
      setStatusMessage({ type: "error", text: "삭제할 캐릭터가 없습니다." });
      return;
    }

    const firstConfirm =
      typeof window !== "undefined"
        ? window.confirm(
            "캐릭터를 삭제하면 되돌릴 수 없습니다. 계속하시겠습니까?",
          )
        : true;
    if (!firstConfirm) return;
    const secondConfirm =
      typeof window !== "undefined"
        ? window.confirm("정말로 캐릭터를 삭제하시겠습니까?")
        : true;
    if (!secondConfirm) return;

    setSavingHero(true);
    setStatusMessage(null);
    try {
      await deleteHeroById(currentHero.id);
      await loadRoster({ force: true });
      setStatusMessage({ type: "success", text: "캐릭터를 삭제했습니다." });
      setCurrentHero(null);
      setEditDraft(createDraftFromHero(null));
      setShowEditForm(false);
      router.replace(router.asPath);
    } catch (error) {
      console.error("Failed to delete hero", error);
      setStatusMessage({
        type: "error",
        text: "삭제에 실패했습니다. 다시 시도해 주세요.",
      });
    } finally {
      setSavingHero(false);
    }
  }, [currentHero, loadRoster, router]);

  const overlayDescription = overlayCopy[activeOverlay] ?? "";

  let overlayBody = null;

  if (activeOverlay === "settings") {
    overlayBody = (
      <div style={overlayContentStyle}>
        <div style={settingsPanelStyle}>
          <div style={settingsSectionStyle}>
            <h3 style={styles.settingsHeading}>브금 제어</h3>
            <div style={styles.settingsRow}>
              <p style={styles.settingsLabel}>캐릭터 브금</p>
              <button
                type="button"
                style={styles.toggleButton(bgmEnabled)}
                onClick={handleBgmToggle}
                aria-pressed={bgmEnabled}
              >
                <span style={styles.toggleKnob(bgmEnabled)} />
              </button>
              <p style={styles.settingsHelper}>
                {bgmEnabled
                  ? "이미지를 보는 동안 테마 BGM이 계속 재생됩니다."
                  : "브금을 꺼두면 캐릭터 진입 시에도 음악이 재생되지 않습니다."}
              </p>
            </div>
            <div style={styles.settingsRow}>
              <p style={styles.settingsLabel}>
                재생 음량 {Math.round(volume * 100)}%
              </p>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                style={styles.slider}
              />
              <p style={styles.settingsHelper}>
                기기에 저장되어 다음 방문 시에도 동일한 음량으로 재생됩니다.
              </p>
            </div>
          </div>

          <div style={settingsSectionStyle}>
            <h3 style={styles.settingsHeading}>음향 효과</h3>
            <div style={styles.settingsRow}>
              <p style={styles.settingsLabel}>
                이퀄라이저 ({currentEqPresetLabel})
              </p>
              <div style={styles.settingsButtonRow}>
                {eqPresets.map((preset) => {
                  const isActive = eqPreset === preset.key;
                  const presetStyle = {
                    ...styles.settingsButton,
                    border: isActive
                      ? "1px solid rgba(56,189,248,0.95)"
                      : styles.settingsButton.border,
                    background: isActive
                      ? "rgba(56,189,248,0.18)"
                      : styles.settingsButton.background,
                    color: isActive ? "#f0f9ff" : styles.settingsButton.color,
                  };
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      style={presetStyle}
                      onClick={() => handleEqSelect(preset.key)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <p style={styles.settingsHelper}>
                프리셋은 현재 기기에 저장되며 아래에서 직접 세부값을 조절할 수
                있습니다.
              </p>
            </div>
            <div style={styles.settingsRow}>
              <p style={styles.settingsLabel}>효과음 및 공간감</p>
              <button
                type="button"
                style={styles.toggleButton(effectsEnabled)}
                onClick={handleEffectsToggle}
                aria-pressed={effectsEnabled}
              >
                <span style={styles.toggleKnob(effectsEnabled)} />
              </button>
              <p style={styles.settingsHelper}>
                {effectsEnabled
                  ? "적당한 공간감과 충돌 효과가 적용됩니다."
                  : "효과음을 최소화하여 조용한 분위기로 플레이합니다."}
              </p>
            </div>
            <div style={styles.settingsRow}>
              <p style={styles.settingsLabel}>
                리버브 믹스 {Math.round(reverbLevel * 100)}%
              </p>
              <div style={styles.settingsSliderRow}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={reverbLevel}
                  onChange={handleReverbChange}
                  style={styles.slider}
                />
                <p style={styles.settingsHelper}>
                  공간감과 잔향을 조절해 분위기를 세밀하게 맞춰보세요.
                </p>
              </div>
            </div>
            <div style={styles.settingsRow}>
              <p style={styles.settingsLabel}>
                컴프레서 강도 {Math.round(compressorLevel * 100)}%
              </p>
              <div style={styles.settingsSliderRow}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={compressorLevel}
                  onChange={handleCompressorChange}
                  style={styles.slider}
                />
                <p style={styles.settingsHelper}>
                  급격한 음량 변화를 눌러 보다 안정적인 청취감을 제공합니다.
                </p>
              </div>
            </div>
            <div style={styles.settingsRow}>
              <p style={styles.settingsLabel}>
                이퀄라이저 세부 조정 (단위: dB)
              </p>
              <p style={styles.settingsSubheading}>저음</p>
              <input
                type="range"
                min={EQ_BAND_MIN}
                max={EQ_BAND_MAX}
                step={EQ_BAND_STEP}
                value={eqBands.low}
                onChange={(event) =>
                  handleEqBandChange("low", event.target.value)
                }
                style={styles.slider}
              />
              <p
                style={styles.settingsHelper}
              >{`${eqBands.low.toFixed(1)} dB`}</p>
              <p style={styles.settingsSubheading}>중음</p>
              <input
                type="range"
                min={EQ_BAND_MIN}
                max={EQ_BAND_MAX}
                step={EQ_BAND_STEP}
                value={eqBands.mid}
                onChange={(event) =>
                  handleEqBandChange("mid", event.target.value)
                }
                style={styles.slider}
              />
              <p
                style={styles.settingsHelper}
              >{`${eqBands.mid.toFixed(1)} dB`}</p>
              <p style={styles.settingsSubheading}>고음</p>
              <input
                type="range"
                min={EQ_BAND_MIN}
                max={EQ_BAND_MAX}
                step={EQ_BAND_STEP}
                value={eqBands.high}
                onChange={(event) =>
                  handleEqBandChange("high", event.target.value)
                }
                style={styles.slider}
              />
              <p
                style={styles.settingsHelper}
              >{`${eqBands.high.toFixed(1)} dB`}</p>
            </div>
          </div>

          <div style={settingsSectionStyle}>
            <h3 style={styles.settingsHeading}>캐릭터 관리</h3>
            <div style={styles.settingsButtonRow}>
              <button
                type="button"
                style={styles.settingsButton}
                onClick={() => {
                  setShowEditForm((prev) => !prev);
                  setStatusMessage(null);
                }}
              >
                {showEditForm ? "편집 닫기" : "캐릭터 편집"}
              </button>
            </div>
            {showEditForm ? (
              <>
                <div style={styles.editForm}>
                  <div style={styles.editField}>
                    <label style={styles.editLabel} htmlFor="hero-name">
                      이름
                    </label>
                    <input
                      id="hero-name"
                      style={styles.editInput}
                      value={editDraft.name}
                      onChange={(event) =>
                        handleDraftChange("name", event.target.value)
                      }
                    />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel} htmlFor="hero-description">
                      설명
                    </label>
                    <textarea
                      id="hero-description"
                      style={styles.editTextarea}
                      value={editDraft.description}
                      onChange={(event) =>
                        handleDraftChange("description", event.target.value)
                      }
                    />
                  </div>
                  {[1, 2, 3, 4].map((index) => (
                    <div key={`ability-${index}`} style={styles.editField}>
                      <label
                        style={styles.editLabel}
                        htmlFor={`hero-ability-${index}`}
                      >
                        능력 {index}
                      </label>
                      <input
                        id={`hero-ability-${index}`}
                        style={styles.editInput}
                        value={editDraft[`ability${index}`]}
                        onChange={(event) =>
                          handleDraftChange(
                            `ability${index}`,
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  ))}
                  <div style={styles.assetGrid}>
                    <div style={styles.assetCard}>
                      <h4 style={styles.assetTitle}>캐릭터 이미지</h4>
                      <div style={styles.assetPreviewFrame}>
                        {imageAsset.preview || editDraft.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageAsset.preview || editDraft.image_url}
                            alt={`${editDraft.name || heroName} 이미지 미리보기`}
                            style={styles.assetPreviewImage}
                          />
                        ) : (
                          <p style={styles.assetPlaceholder}>
                            등록된 이미지가 없습니다.
                          </p>
                        )}
                      </div>
                      <div style={styles.assetButtonRow}>
                        <label
                          htmlFor="hero-image-upload"
                          style={styles.assetActionButton}
                        >
                          {imageAsset.file ? "다른 이미지 선택" : "이미지 선택"}
                        </label>
                        <input
                          id="hero-image-upload"
                          ref={imageInputRef}
                          type="file"
                          accept="image/*"
                          style={styles.hiddenInput}
                          onChange={handleImageFileSelect}
                        />
                        {imageAsset.file || editDraft.image_url ? (
                          <button
                            type="button"
                            style={styles.assetDangerButton}
                            onClick={handleClearImage}
                          >
                            이미지 비우기
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div style={styles.assetCard}>
                      <h4 style={styles.assetTitle}>배경 이미지</h4>
                      <div style={styles.assetPreviewFrame}>
                        {backgroundAsset.preview || editDraft.background_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              backgroundAsset.preview ||
                              editDraft.background_url
                            }
                            alt={`${editDraft.name || heroName} 배경 미리보기`}
                            style={styles.assetPreviewImage}
                          />
                        ) : (
                          <p style={styles.assetPlaceholder}>
                            배경 이미지가 지정되지 않았습니다.
                          </p>
                        )}
                      </div>
                      <div style={styles.assetButtonRow}>
                        <label
                          htmlFor="hero-background-upload"
                          style={styles.assetActionButton}
                        >
                          {backgroundAsset.file
                            ? "다른 배경 선택"
                            : "배경 선택"}
                        </label>
                        <input
                          id="hero-background-upload"
                          ref={backgroundInputRef}
                          type="file"
                          accept="image/*"
                          style={styles.hiddenInput}
                          onChange={handleBackgroundFileSelect}
                        />
                        {backgroundAsset.file || editDraft.background_url ? (
                          <button
                            type="button"
                            style={styles.assetDangerButton}
                            onClick={handleClearBackground}
                          >
                            배경 비우기
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div style={styles.assetCard}>
                      <h4 style={styles.assetTitle}>캐릭터 브금</h4>
                      <div style={styles.bgmList}>
                        {bgmTracks.length ? (
                          bgmTracks.map((track, index) => (
                            <div key={track.id} style={styles.bgmTrackCard}>
                              <div style={styles.bgmTrackHeader}>
                                <h5 style={styles.bgmTrackHeaderTitle}>
                                  {track.label || `브금 ${index + 1}`}
                                </h5>
                                {track.file ? (
                                  <span style={styles.bgmTrackBadge}>
                                    업로드 예정
                                  </span>
                                ) : null}
                              </div>
                              <div style={styles.bgmTrackField}>
                                <label
                                  style={styles.bgmTrackLabel}
                                  htmlFor={`hero-bgm-label-${track.id}`}
                                >
                                  제목
                                </label>
                                <input
                                  id={`hero-bgm-label-${track.id}`}
                                  style={styles.editInput}
                                  value={track.label}
                                  onChange={(event) =>
                                    handleBgmLabelChange(
                                      track.id,
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div style={styles.bgmTrackMeta}>
                                <div style={styles.assetMetaRow}>
                                  <span style={styles.assetMetaLabel}>파일</span>
                                  <span style={styles.assetMetaValue}>
                                    {track.file
                                      ? track.file.name
                                      : track.url
                                        ? extractFileName(track.url)
                                        : "선택된 파일 없음"}
                                  </span>
                                </div>
                                <div style={styles.assetMetaRow}>
                                  <span style={styles.assetMetaLabel}>길이</span>
                                  <span style={styles.assetMetaValue}>
                                    {formatBgmDuration(track.duration)}
                                  </span>
                                </div>
                                <div style={styles.assetMetaRow}>
                                  <span style={styles.assetMetaLabel}>형식</span>
                                  <span style={styles.assetMetaValue}>
                                    {track.mime ||
                                      (track.url ? "미확인" : "없음")}
                                  </span>
                                </div>
                                {track.error ? (
                                  <p style={styles.rosterError}>{track.error}</p>
                                ) : null}
                              </div>
                              <div style={styles.bgmTrackButtons}>
                                <label
                                  htmlFor={`hero-bgm-upload-${track.id}`}
                                  style={styles.assetActionButton}
                                >
                                  {track.file
                                    ? "다른 브금 선택"
                                    : track.url
                                      ? "브금 교체"
                                      : "브금 선택"}
                                </label>
                                <input
                                  id={`hero-bgm-upload-${track.id}`}
                                  ref={(node) => {
                                    if (!bgmInputRefs.current) {
                                      bgmInputRefs.current = {};
                                    }
                                    if (node) {
                                      bgmInputRefs.current[track.id] = node;
                                    } else if (
                                      bgmInputRefs.current[
                                        track.id
                                      ]
                                    ) {
                                      delete bgmInputRefs.current[track.id];
                                    }
                                  }}
                                  type="file"
                                  accept="audio/*"
                                  style={styles.hiddenInput}
                                  onChange={handleBgmFileSelect(track.id)}
                                />
                                {track.url || track.file ? (
                                  <button
                                    type="button"
                                    style={styles.assetDangerButton}
                                    onClick={() => handleClearBgmFile(track.id)}
                                  >
                                    파일 비우기
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  style={styles.assetDangerButton}
                                  onClick={() => handleRemoveBgmTrack(track.id)}
                                >
                                  브금 삭제
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p style={styles.bgmEmpty}>
                            등록된 브금이 없습니다. 아래 버튼이나 브금바에서
                            곡을 불러올 수 있어요.
                          </p>
                        )}
                      </div>
                      <div style={styles.assetButtonRow}>
                        <button
                          type="button"
                          style={{
                            ...styles.assetActionButton,
                            opacity: bgmTracks.length >= MAX_BGM_TRACKS ? 0.65 : 1,
                            cursor:
                              bgmTracks.length >= MAX_BGM_TRACKS
                                ? "not-allowed"
                                : "pointer",
                          }}
                          onClick={handleAddBgmTrack}
                          disabled={bgmTracks.length >= MAX_BGM_TRACKS}
                        >
                          {bgmTracks.length >= MAX_BGM_TRACKS
                            ? "브금은 하나만 등록할 수 있어요"
                            : "빈 브금 슬롯 추가"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={styles.formActions}>
                  <button
                    type="button"
                    style={{
                      ...styles.primaryFormButton,
                      opacity: savingHero ? 0.7 : 1,
                      cursor: savingHero ? "wait" : "pointer",
                    }}
                    onClick={handleSaveDraft}
                    disabled={savingHero}
                  >
                    {savingHero ? "저장 중…" : "저장"}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.secondaryFormButton,
                      opacity: savingHero ? 0.7 : 1,
                      cursor: savingHero ? "not-allowed" : "pointer",
                    }}
                    onClick={handleResetDraft}
                    disabled={savingHero}
                  >
                    되돌리기
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.dangerButton,
                      opacity: savingHero ? 0.7 : 1,
                      cursor: savingHero ? "not-allowed" : "pointer",
                    }}
                    onClick={handleDeleteHero}
                    disabled={savingHero}
                  >
                    캐릭터 삭제
                  </button>
                </div>
              </>
            ) : (
              <p style={styles.settingsHelper}>
                캐릭터 정보를 빠르게 수정하고 저장하거나 필요하다면 삭제할 수
                있습니다.
              </p>
            )}
            {statusMessage ? (
              <p style={styles.statusText(statusMessage.type)}>
                {statusMessage.text}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  } else if (activeOverlay === "search") {
    overlayBody = (
      <div style={overlayContentStyle}>
        <div style={styles.gameSearchPanel}>
          <div style={styles.gameSearchControls}>
            <input
              type="search"
              placeholder="게임 이름 또는 설명 검색"
              value={gameQuery}
              onChange={(event) => setGameQuery(event.target.value)}
              style={styles.gameSearchInput}
            />
            <select
              value={gameSort}
              onChange={(event) => setGameSort(event.target.value)}
              style={styles.gameSearchSelect}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div style={gameSearchLayoutStyle}>
            <div style={gameListSectionStyle}>
              {gameLoading ? (
                <p style={styles.gameSearchStatus}>게임 목록을 불러오는 중입니다…</p>
              ) : !gameRows.length ? (
                <p style={styles.gameSearchStatus}>조건에 맞는 게임이 없습니다.</p>
              ) : (
                <ul style={styles.gameSearchList}>
                  {gameRows.map((row) => {
                    const isActive = selectedGame?.id === row.id;
                    return (
                      <li key={row.id} style={styles.gameSearchListItemWrapper}>
                        <button
                          type="button"
                          style={styles.gameSearchListItem(isActive)}
                          onClick={() => setSelectedGame(row)}
                        >
                          <div style={styles.gameSearchListHeader}>
                            <span style={styles.gameSearchListTitle}>{row.name}</span>
                            <span style={styles.gameSearchListMetric}>
                              👍 {row.likes_count ?? 0}
                            </span>
                          </div>
                          <p style={styles.gameSearchListDescription}>
                            {row.description || "설명이 없습니다."}
                          </p>
                          <div style={styles.gameSearchListMetaRow}>
                            <span>플레이 {row.play_count ?? 0}</span>
                            <span>등록 {formatGameDate(row.created_at)}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div style={gameDetailSectionStyle}>
              {detailLoading ? (
                <p style={styles.gameSearchStatus}>선택한 게임을 불러오는 중입니다…</p>
              ) : !selectedGame ? (
                <p style={styles.gameSearchStatus}>왼쪽 목록에서 게임을 선택해 주세요.</p>
              ) : (
                <div style={styles.gameSearchDetailCard}>
                  <header style={styles.gameSearchDetailHeader}>
                    <h3 style={styles.gameSearchDetailTitle}>{selectedGame.name}</h3>
                    <p style={styles.gameSearchDetailDescription}>
                      {selectedGame.description || "설명이 없습니다."}
                    </p>
                    <div style={styles.gameSearchDetailMeta}>
                      <span>등록 {formatGameDate(selectedGame.created_at)}</span>
                      <span>좋아요 {selectedGame.likes_count ?? 0}</span>
                      <span>플레이 {selectedGame.play_count ?? 0}</span>
                    </div>
                  </header>

                  <section style={styles.gameSearchRolesSection}>
                    <h4 style={styles.gameSearchSectionTitle}>역할 선택</h4>
                    {gameRoles.length ? (
                      <div style={styles.gameSearchRoleGrid}>
                        {gameRoles.map((role) => {
                          const slot =
                            roleSlots.get(role.name) || {
                              capacity: role.slot_count ?? 1,
                              occupied: 0,
                            };
                          const full = slot.occupied >= slot.capacity;
                          const isActive = roleChoice === role.name;
                          return (
                            <button
                              key={role.id || role.name}
                              type="button"
                              style={styles.gameSearchRoleButton(isActive, full && !isActive)}
                              onClick={() => handleRoleSelect(role.name)}
                              disabled={full && !isActive}
                            >
                              <span style={styles.gameSearchRoleName}>{role.name}</span>
                              <span style={styles.gameSearchRoleCapacity}>
                                {slot.occupied} / {slot.capacity}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={styles.gameSearchStatus}>등록된 역할 정보가 없습니다.</p>
                    )}
                  </section>

                  <p style={styles.gameSearchParticipantsSummary}>
                    {participants.length
                      ? `최근 ${participants.length}명 참가`
                      : "참가 기록이 아직 없습니다."}
                  </p>

                  <button
                    type="button"
                    style={styles.gameSearchEnterButton(Boolean(roleChoice))}
                    onClick={() => handleEnterGame(selectedGame, roleChoice)}
                  >
                    {roleChoice ? `${roleChoice}로 입장하기` : "게임 상세 보기"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={styles.gameSearchActionRow}>
            <button
              type="button"
              style={styles.gamePrimaryAction}
              onClick={() => router.push("/maker")}
            >
              게임 제작
            </button>
            <button
              type="button"
              style={styles.gameSecondaryAction}
              onClick={() => router.push("/rank/new")}
            >
              게임 등록
            </button>
          </div>
        </div>
      </div>
    );
  } else if (activeOverlay === "roster") {
    overlayBody = (
      <div style={overlayContentStyle}>
        <div style={styles.rosterPanel}>
          <div style={styles.noticeList}>
            {rosterNotices.map((notice) => (
              <article key={notice.id} style={styles.noticeCard}>
                <span style={styles.noticeBadge}>공지</span>
                <h3 style={styles.noticeTitle}>{notice.title}</h3>
                <p style={styles.noticeCopy}>{notice.message}</p>
              </article>
            ))}
          </div>
          <div style={styles.rosterList}>
            <div style={styles.rosterHeader}>
              <h3 style={styles.rosterTitle}>내 영웅 목록</h3>
              <button
                type="button"
                style={{
                  ...styles.rosterRefresh,
                  opacity: rosterLoading ? 0.6 : 1,
                  cursor: rosterLoading ? "wait" : "pointer",
                }}
                onClick={handleRosterRefresh}
                disabled={rosterLoading}
              >
                {rosterLoading ? "새로고치는 중…" : "새로고침"}
              </button>
            </div>
            {rosterError ? (
              <p style={styles.rosterError}>{rosterError}</p>
            ) : null}
            {rosterLoading && rosterHeroes.length === 0 ? (
              <p style={styles.rosterEmpty}>로스터를 불러오는 중입니다…</p>
            ) : null}
            {!rosterLoading && !rosterError && rosterHeroes.length === 0 ? (
              <p style={styles.rosterEmpty}>
                등록된 영웅이 없습니다. 로스터에서 새 영웅을 만들어보세요.
              </p>
            ) : null}
            {rosterHeroes.map((entry) => {
              const isActiveHero = entry.id === currentHero?.id;
              const timestamp = entry.updated_at || entry.created_at;
              return (
                <button
                  key={entry.id}
                  type="button"
                  style={styles.rosterButton(isActiveHero)}
                  onClick={() => handleRosterHeroSelect(entry.id)}
                >
                  {entry.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.image_url}
                      alt={entry.name}
                      style={styles.rosterAvatarImage}
                    />
                  ) : (
                    <div style={styles.rosterAvatar}>
                      {entry.name.slice(0, 2)}
                    </div>
                  )}
                  <div style={styles.rosterMeta}>
                    <p style={styles.rosterName}>{entry.name}</p>
                    <p style={styles.rosterTimestamp}>
                      {formatRosterTimestamp(timestamp)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={backgroundStyle}>
        <div style={stageStyle}>
          <div style={styles.heroSection}>
            <div style={styles.heroCardShell}>
              <div
                role="button"
                tabIndex={0}
                style={heroCardStyle}
                onClick={handleTap}
                onKeyUp={handleKeyUp}
                data-swipe-ignore="true"
              >
                <div style={styles.cornerIcon} aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <span key={`dot-${index}`} style={styles.cornerDot} />
                  ))}
                </div>

                {currentHero?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentHero.image_url}
                    alt={heroName}
                    style={heroImageStyle}
                  />
                ) : (
                  <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
                )}

                {viewMode === 0 ? (
                  <div style={heroNameOverlayStyle}>
                    <p style={heroNameBadgeStyle}>{heroName}</p>
                  </div>
                ) : null}

                {currentInfo ? (
                  <div style={heroInfoOverlayStyle}>
                    <p style={styles.heroInfoTitle}>{currentInfo.title}</p>
                    <p style={styles.heroInfoText}>
                      {currentInfo.lines.join("\n")}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={overlayContainerStyle}>
        <button
          type="button"
          style={styles.overlayToggleButton}
          onClick={handleOverlayToggle}
          aria-expanded={!overlayCollapsed}
          aria-label={overlayCollapsed ? "하단 패널 펼치기" : "하단 패널 접기"}
        >
          {overlayCollapsed ? "▴" : "▾"}
        </button>

        {!overlayCollapsed ? (
          <div style={overlayPanelStyle}>
            <div style={styles.overlayButtonsRow}>
              {dockItems.map((item) => {
                if (item.type === "action") {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      style={styles.overlayActionButton}
                      onClick={() => handleDockAction(item.key)}
                    >
                      {item.label}
                    </button>
                  );
                }

                return (
                  <button
                    key={item.key}
                    type="button"
                    style={styles.overlayButton(activeOverlay === item.key)}
                    onClick={() => handleOverlayButton(item.key)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {showBgmBar ? (
              <div style={styles.bgmBar}>
                <div style={styles.bgmMetaRow}>
                  <div style={styles.bgmMetaInfo}>
                    <p style={styles.bgmTrackTitle}>
                      {hasActiveTrack ? activeBgm?.label || "브금" : "브금 없음"}
                    </p>
                    <div style={styles.bgmMetaSub}>
                      {hasActiveTrack ? (
                        <span style={styles.bgmMetaTimes}>
                          {formattedCurrentTime} / {formattedDuration}
                        </span>
                      ) : (
                        <span style={styles.bgmMetaTimes}>브금을 선택해 주세요</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={styles.bgmCollapseButton}
                    onClick={handleToggleBgmBar}
                    aria-expanded={!bgmBarCollapsed}
                    aria-label={
                      bgmBarCollapsed ? "브금 컨트롤 펼치기" : "브금 컨트롤 접기"
                    }
                  >
                    {bgmBarCollapsed ? "▾" : "▴"}
                  </button>
                </div>
                {!bgmBarCollapsed ? (
                  <>
                    <div style={styles.bgmControlsRow}>
                      <div style={styles.bgmControlsGroup}>
                        <button
                          type="button"
                          style={styles.bgmControlButton(
                            isBgmPlaying && hasActiveTrack,
                            !hasActiveTrack,
                          )}
                          onClick={handleBgmPlayPause}
                          aria-label={isBgmPlaying ? "일시정지" : "재생"}
                          disabled={!hasActiveTrack}
                        >
                          {isBgmPlaying ? "⏸" : "▶"}
                        </button>
                        <button
                          type="button"
                          style={styles.bgmControlButton(false, !hasActiveTrack)}
                          onClick={handleBgmStop}
                          aria-label="정지"
                          disabled={!hasActiveTrack}
                        >
                          ⏹
                        </button>
                        <button
                          type="button"
                          style={styles.bgmControlButton(false, !hasActiveTrack)}
                          onClick={handleBgmRestart}
                          aria-label="처음부터 재생"
                          disabled={!hasActiveTrack}
                        >
                          ↺
                        </button>
                      </div>
                      <div style={styles.bgmQuickActions}>
                        <button
                          type="button"
                          style={{
                            ...styles.bgmQuickButton,
                            opacity: savingHero ? 0.5 : 1,
                            cursor: savingHero ? "not-allowed" : "pointer",
                          }}
                          onClick={handleQuickBgmButtonClick}
                          disabled={savingHero}
                        >
                          🎵 브금 교체·저장
                        </button>
                      </div>
                    </div>
                    <input
                      ref={quickBgmInputRef}
                      type="file"
                      accept="audio/*"
                      style={styles.hiddenInput}
                      onChange={handleQuickBgmFileInput}
                    />
                    <div style={styles.bgmProgressRow}>
                      <span style={styles.bgmTime}>{formattedCurrentTime}</span>
                      <div
                        ref={progressBarRef}
                        style={styles.bgmProgressTrack}
                        onMouseDown={handleProgressMouseDown}
                        onTouchStart={handleProgressTouchStart}
                        onKeyDown={handleProgressKeyDown}
                        role="slider"
                        tabIndex={hasActiveTrack ? 0 : -1}
                        aria-label="브금 재생 위치"
                        aria-valuemin={0}
                        aria-valuemax={hasKnownDuration ? trackDuration : 1}
                        aria-valuenow={
                          hasKnownDuration
                            ? Math.min(trackDuration, Math.max(0, trackTime))
                            : 0
                        }
                        aria-valuetext={
                          hasKnownDuration
                            ? `${formattedCurrentTime} / ${formattedDuration}`
                            : formattedCurrentTime
                        }
                        aria-disabled={!hasKnownDuration || !hasActiveTrack}
                      >
                        <div
                          style={{
                            ...styles.bgmProgressFill,
                            width: trackProgressPercent,
                          }}
                        />
                        <div
                          style={{
                            ...styles.bgmProgressHandle,
                            left: trackProgressPercent,
                          }}
                        />
                      </div>
                      <span style={styles.bgmTime}>{formattedDuration}</span>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {showChatLauncher ? (
              <div style={styles.characterFooterRow}>
                <button
                  type="button"
                  style={{
                    ...styles.chatLauncherButton,
                    opacity: chatOpen ? 0.78 : 1,
                    cursor: chatOpen ? "default" : "pointer",
                  }}
                  onClick={handleOpenChat}
                >
                  <span>💬 공용 채팅</span>
                  {chatUnread ? (
                    <span style={styles.chatLauncherBadge}>{chatBadgeLabel}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.friendLauncherButton,
                    opacity: friendsLoading ? 0.65 : 1,
                    cursor: friendsLoading ? "wait" : "pointer",
                  }}
                  onClick={() => {
                    if (friendsLoading) return;
                    handleOpenFriendOverlay();
                  }}
                  aria-disabled={friendsLoading}
                >
                  <span>🤝 친구</span>
                  {requestBadgeLabel ? (
                    <span style={styles.friendLauncherBadge}>{requestBadgeLabel}</span>
                  ) : null}
                </button>
              </div>
            ) : null}

            {overlayDescription ? (
              <p style={styles.overlayCopy}>{overlayDescription}</p>
            ) : null}

            {overlayBody}
          </div>
        ) : null}
      </div>
      <ChatOverlay
        ref={chatOverlayRef}
        open={chatOpen}
        onClose={handleCloseChat}
        heroId={currentHero?.id || null}
        viewerHero={viewerHeroHint}
        extraWhisperTargets={whisperTargets}
        blockedHeroes={blockedHeroes}
        onUnreadChange={handleChatUnreadChange}
        onBlockedHeroesChange={handleBlockedHeroesChange}
        onRequestAddFriend={handleRequestAddFriend}
        onRequestRemoveFriend={handleRequestRemoveFriend}
        isFriend={(heroMeta) => {
          const heroId = heroMeta?.heroId || heroMeta?.id;
          if (!heroId) return false;
          return Boolean(friendByHero?.get?.(heroId));
        }}
      />
      <FriendOverlay
        open={friendOverlayOpen}
        onClose={handleCloseFriendOverlay}
        viewer={viewer}
        friends={friends}
        friendRequests={friendRequests}
        loading={friendsLoading}
        error={friendError}
        onAddFriend={addFriend}
        onRemoveFriend={removeFriend}
        onAcceptRequest={acceptFriendRequest}
        onDeclineRequest={declineFriendRequest}
        onCancelRequest={cancelFriendRequest}
        onOpenWhisper={handleOpenWhisper}
        blockedHeroes={blockedHeroes}
        onToggleBlockedHero={handleToggleBlockedHero}
      />
    </>
  );
}
