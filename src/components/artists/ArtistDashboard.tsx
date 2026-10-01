"use client";

import Link from "next/link";
import { useState } from "react";
import { artistProfileSchema, type ArtistProfile } from "@/lib/artists";
import { slugify } from "@/lib/song";
import { usePreferences } from "../Preferences";
import { useLive } from "../rooms/useRooms";
import { artistErrorText, useArtists } from "./useArtists";

const STATUS_CLASS = { pending: "bg-accent-soft text-accent", approved: "bg-green-600/15 text-green-700", rejected: "bg-red-600/10 text-red-600" };

/** For artists: edit your public page and follow your submissions through review. */
export function ArtistDashboard() {
  const { t } = usePreferences();
  const artists = useArtists();
  const [mine, reload] = useLive(artists ? () => artists.mine() : null, null, [artists]);
  const [songs] = useLive(artists ? () => artists.mySongs() : null, null, [artists, mine]);

  return (
    <section className="space-y-5 pt-4">
      <h1 className="text-3xl font-bold">{t.artists.title}</h1>
      <p className="text-muted">{t.artists.intro}</p>
      {artists?.kind === "device" && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">{t.artists.deviceMode}</p>}

      {mine === undefined ? (
        <p className="text-muted">…</p>
      ) : mine === "signed_out" ? (
        <p className="rounded-2xl border border-border bg-surface p-5">
          <Link href="/settings" className="underline">
            {t.artists.signIn}
          </Link>
        </p>
      ) : (
        <>
          <ProfileForm key={mine?.slug ?? "new"} current={mine} onSaved={reload} />
          {mine && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Link href="/studio" className="rounded-xl bg-accent px-4 py-3 font-semibold text-white">
                  ⬆ {t.artists.upload}
                </Link>
                <Link href={`/artists/${mine.slug}`} className="rounded-xl border border-border px-4 py-3 font-medium">
                  {t.artists.viewPage}
                </Link>
              </div>
              <h2 className="text-lg font-semibold">{t.artists.songs}</h2>
              {!songs?.length ? (
                <p className="text-muted">{t.artists.noSongs}</p>
              ) : (
                <ul className="space-y-2" aria-label={t.artists.songs}>
                  {songs.map((song) => (
                    <li key={song.id} className="rounded-2xl border border-border bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{song.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[song.status]}`}>{t.artists[song.status]}</span>
                      </div>
                      {song.note && <p className="mt-1 text-sm text-muted">{song.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ProfileForm({ current, onSaved }: { current: ArtistProfile | null; onSaved: () => void }) {
  const { t } = usePreferences();
  const artists = useArtists();
  const [name, setName] = useState(current?.name ?? "");
  const [slug, setSlug] = useState(current?.slug ?? "");
  const [bio, setBio] = useState(current?.bio ?? "");
  const [links, setLinks] = useState((current?.links ?? []).join("\n"));
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const parsed = artistProfileSchema.safeParse({ name, slug, bio, links: links.split("\n").map((l) => l.trim()).filter(Boolean) });
    if (!parsed.success || !artists) return setMessage(t.artists.invalid);
    const outcome = await artists.save(parsed.data);
    setMessage(outcome.ok ? t.artists.saved : artistErrorText(t, outcome.error));
    if (outcome.ok) onSaved();
  }

  const field = "w-full rounded-xl border border-border bg-bg px-4 py-3";
  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="block">
        <span className="mb-1 block font-medium">{t.artists.name}</span>
        <input
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            if (!current) setSlug(slugify(e.target.value).slice(0, 40));
          }}
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">{t.artists.slug}</span>
        <span className="flex items-center gap-1" dir="ltr">
          <span className="text-muted">/artists/</span>
          <input value={slug} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase())} className={field} />
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">{t.artists.bio}</span>
        <textarea value={bio} maxLength={1000} rows={3} onChange={(e) => setBio(e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">{t.artists.links}</span>
        <textarea value={links} rows={3} onChange={(e) => setLinks(e.target.value)} className={field} dir="ltr" placeholder="https://" />
      </label>
      <button type="submit" disabled={!name.trim() || !slug} className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50">
        {t.artists.save}
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
