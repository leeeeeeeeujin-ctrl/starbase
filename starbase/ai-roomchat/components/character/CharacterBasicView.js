"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_HERO_NAME = "이름 없는 영웅";
const DEFAULT_DESCRIPTION =
  "소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.";

function normaliseText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function buildInfoSequence(hero) {
  if (!hero) {
    return [
      {
        key: "description",
        title: "소개",
        lines: [DEFAULT_DESCRIPTION],
      },
    ];
  }

  const descriptionLines = normaliseText(hero.description, DEFAULT_DESCRIPTION)
    .split(/\r?\n/)
    .filter(Boolean);

  const abilityEntries = [hero.ability1, hero.ability2, hero.ability3, hero.ability4]
    .map((value, index) => ({
      key: `ability-${index + 1}`,
      label: `능력 ${index + 1}`,
      text: normaliseText(value, "준비 중입니다."),
    }));

  const pairedAbilities = [];
  for (let i = 0; i < abilityEntries.length; i += 2) {
    const slice = abilityEntries.slice(i, i + 2);
    if (!slice.length) continue;
    pairedAbilities.push({
      key: slice.map((entry) => entry.key).join("-"),
      title: slice.map((entry) => entry.label).join(" · "),
      lines: slice.map((entry) => entry.text),
    });
  }

  return [
    {
      key: "description",
      title: "소개",
      lines: descriptionLines.length ? descriptionLines : [DEFAULT_DESCRIPTION],
    },
    ...pairedAbilities,
  ];
}

export default function CharacterBasicView({ hero }) {
  const heroName = normaliseText(hero?.name, DEFAULT_HERO_NAME);
  const infoSequence = useMemo(() => buildInfoSequence(hero), [hero]);
  const [infoIndex, setInfoIndex] = useState(0);
  const abilityPreviewLines = useMemo(() => {
    return infoSequence
      .filter((entry) => entry.key.startsWith("ability"))
      .flatMap((entry) => entry.lines)
      .filter(Boolean);
  }, [infoSequence]);

  const activeInfo = infoSequence[infoIndex] || infoSequence[0];

  useEffect(() => {
    if (infoIndex < infoSequence.length) return;
    setInfoIndex(0);
  }, [infoIndex, infoSequence.length]);

  const handleCycleInfo = () => {
    setInfoIndex((prev) => {
      if (!infoSequence.length) return 0;
      return (prev + 1) % infoSequence.length;
    });
  };

  const backgroundStyle = hero?.background_url
    ? {
        backgroundImage: `url(${hero.background_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "radial-gradient(circle at top, #1e293b 0%, #020617 60%, #000 100%)",
      };

  const heroHasImage = Boolean(hero?.image_url);
  const heroImageStyle = heroHasImage
    ? {
        backgroundImage: `url(${hero.image_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, rgba(59,130,246,0.45), rgba(14,116,144,0.55))",
      };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        position: "relative",
        overflow: "hidden",
        color: "#e2e8f0",
        ...backgroundStyle,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.85) 65%, rgba(15,23,42,0.95) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 960,
          margin: "0 auto",
          padding: "60px 24px 120px",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 32,
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(148, 163, 184, 0.75)",
            }}
          >
            CHARACTER PROFILE
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: 42,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#f8fafc",
            }}
          >
            {heroName}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: "rgba(226, 232, 240, 0.75)",
              lineHeight: 1.6,
            }}
          >
            이미지를 탭하면 소개와 능력 정보를 순서대로 확인할 수 있습니다.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gap: 24,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            alignItems: "stretch",
          }}
        >
          <button
            type="button"
            onClick={handleCycleInfo}
            style={{
              border: "none",
              padding: 0,
              borderRadius: 28,
              overflow: "hidden",
              cursor: "pointer",
              minHeight: 420,
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.45)",
              position: "relative",
              isolation: "isolate",
              background: "transparent",
            }}
            aria-label="캐릭터 정보 순환"
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                filter: "brightness(0.68)",
                transition: "filter 180ms ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...heroImageStyle,
              }}
            >
              {!heroHasImage ? (
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 42,
                    letterSpacing: "0.08em",
                    color: "#0f172a",
                  }}
                >
                  {heroName.slice(0, 2)}
                </span>
              ) : null}
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.85) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 28,
                left: 28,
                right: 28,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                textAlign: "left",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  letterSpacing: "0.08em",
                  color: "rgba(148, 163, 184, 0.85)",
                }}
              >
                {activeInfo?.title || "정보"}
              </p>
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-line",
                  fontSize: 18,
                  lineHeight: 1.6,
                  fontWeight: 500,
                  color: "#f8fafc",
                  textShadow: "0 1px 3px rgba(2, 6, 23, 0.75)",
                }}
              >
                {(activeInfo?.lines || [DEFAULT_DESCRIPTION]).join("\n")}
              </p>
            </div>
          </button>

          <aside
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: 28,
              padding: "32px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
              boxShadow: "0 14px 40px rgba(2, 6, 23, 0.55)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 600,
                  color: "#f8fafc",
                }}
              >
                캐릭터 정보
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: "rgba(226, 232, 240, 0.72)",
                }}
              >
                {descriptionSummary(hero)}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "rgba(148, 163, 184, 0.9)",
                  letterSpacing: "0.08em",
                }}
              >
                능력 미리보기
              </h3>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {abilityPreviewLines.length ? (
                  abilityPreviewLines.map((line, index) => (
                    <li
                      key={`ability-preview-${index}`}
                      style={{
                        fontSize: 15,
                        lineHeight: 1.6,
                        color: "rgba(226, 232, 240, 0.82)",
                      }}
                    >
                      {line}
                    </li>
                  ))
                ) : (
                  <li
                    style={{
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: "rgba(226, 232, 240, 0.62)",
                    }}
                  >
                    아직 등록된 능력이 없습니다.
                  </li>
                )}
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function descriptionSummary(hero) {
  if (!hero) {
    return DEFAULT_DESCRIPTION;
  }
  const text = normaliseText(hero.description, DEFAULT_DESCRIPTION);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
