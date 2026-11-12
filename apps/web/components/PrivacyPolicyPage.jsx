import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import {
  infoBack,
  infoContent,
  infoIntro,
  infoPage,
  infoSection,
  infoSectionBody,
  infoSectionTitle,
  infoTitle,
} from "@/lib/ui";

const LAST_UPDATED = "November 12, 2026";

export function PrivacyPolicyContent() {
  return (
    <>
      <p className={infoIntro}>Last updated {LAST_UPDATED}.</p>

      <section className={infoSection}>
          <h2 className={infoSectionTitle}>Overview</h2>
          <div className={infoSectionBody}>
            <p>
              Worldly (&ldquo;we,&rdquo; &ldquo;us&rdquo;) is a geography learning game available
              at beworldly.app and as an iOS/Android app. This policy explains what information we
              collect, why we collect it, and the choices you have. You can use most of Worldly
              &mdash; Explore, Discover, Test, and Go! &mdash; without creating an account. Creating
              an account unlocks Learn mode, a saved mastery history, and friends/leaderboards.
            </p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Information we collect</h2>
          <div className={infoSectionBody}>
            <p>
              <strong>Account information.</strong> If you create an account: your email address, a
              display name and username, and a securely hashed password (we never store your
              password in plain text). Signing in with Face ID/Touch ID on mobile is handled
              entirely by your device&rsquo;s operating system &mdash; we never receive or store
              biometric data ourselves, only a device-held token that Face ID/Touch ID unlocks
              locally.
            </p>
            <p>
              <strong>Gameplay and mastery data.</strong> To power Worldly&rsquo;s mastery tracking
              and spaced-repetition Learn mode, we record, per signed-in account: which country you
              were asked about, whether you got it right, how long you took to answer, and your
              resulting mastery score for that country and skill. We also record daily practice
              streaks, session counts, and best scores per mode/region.
            </p>
            <p>
              <strong>Friends and leaderboard.</strong> If you use the friends feature, your
              username, display name, %Worldly score, streak, and most-active region become
              visible to friends who&rsquo;ve mutually accepted a friend request with you. Adding a
              friend requires their explicit acceptance &mdash; we don&rsquo;t share this
              information with anyone who hasn&rsquo;t accepted.
            </p>
            <p>
              <strong>Push notification tokens.</strong> If you enable notifications on mobile, we
              store a device push token (via Apple/Google&rsquo;s push infrastructure, relayed
              through Expo&rsquo;s push service) so we can send you streak reminders and friend
              activity alerts. We don&rsquo;t use this token for anything else.
            </p>
            <p>
              <strong>Countries you&rsquo;ve visited.</strong> On mobile you can optionally mark
              countries you&rsquo;ve been to, either by adding them yourself or by scanning your
              photo library. The scan runs on your phone. We use a photo&rsquo;s date and location
              only on the device, to decide which country it was taken in. The photos themselves,
              the GPS coordinates, and the filenames never leave your phone. If you save the result
              to your account, we store the country code, the earliest date we saw, how many photos
              supported it, and whether you confirmed the visit. You can clear this list in the app
              without deleting your account.
            </p>
            <p>
              <strong>Technical information.</strong> Like most web and mobile apps, our hosting
              infrastructure logs standard request metadata (e.g. IP address, timestamps) for
              security and abuse prevention. We don&rsquo;t use third-party advertising or analytics
              trackers.
            </p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>How we use this information</h2>
          <div className={infoSectionBody}>
            <p>
              We use the information above to: operate your account and keep you signed in; compute
              and display your mastery scores, streaks, and %Worldly progress; personalize which
              countries Learn mode and Go! show you next; show the countries you&rsquo;ve marked as
              visited; power the friends leaderboard; send account emails (verification, password
              reset) and, if enabled, push notifications; and detect and prevent abuse of the
              service.
            </p>
            <p>We do not sell your personal information, and we do not use it for advertising.</p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Who we share it with</h2>
          <div className={infoSectionBody}>
            <p>
              We share information only with the service providers that help us run Worldly, and
              only as needed for them to provide that service:
            </p>
            <p>
              <strong>Resend</strong> (email delivery) sends verification and password-reset emails
              on our behalf. <strong>Expo</strong> (push notifications) relays push tokens and
              notification content to Apple/Google&rsquo;s push services. <strong>Mapbox</strong>{" "}
              (map rendering) receives map-tile requests as you interact with the game map.{" "}
              <strong>Railway</strong> hosts our database and servers. None of these providers are
              permitted to use your information for their own purposes.
            </p>
            <p>We do not otherwise share your information with third parties, and we do not sell it.</p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Data retention</h2>
          <div className={infoSectionBody}>
            <p>
              We keep your account and gameplay data for as long as your account is active. You can
              permanently erase your mastery scores, streaks, and practice history at any time from
              Settings &rarr; Reset practice, without affecting your ability to sign in. Visited
              countries can be cleared on their own from the mobile app.
            </p>
            <p>
              You can delete the account itself from inside the app. On the web, that&rsquo;s
              Settings &rarr; Delete account. In the mobile app, it&rsquo;s Settings &rarr; Delete
              account. Deletion is immediate. We remove the account and the data tied to it,
              including mastery, scores, streaks, friends, push tokens, and visited countries. This
              cannot be undone. Resetting your password also signs every mobile device out of the
              account.
            </p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Your choices</h2>
          <div className={infoSectionBody}>
            <p>
              You can reset your practice/mastery history yourself at any time (Settings &rarr;
              Reset practice), and you can delete your whole account from Settings on the web or in
              the mobile app. Questions about your data can go to{" "}
              <a href="mailto:privacy@beworldly.app">privacy@beworldly.app</a>.
            </p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Children&rsquo;s privacy</h2>
          <div className={infoSectionBody}>
            <p>
              Worldly is a general-audience geography app and is not directed at children under 13.
              We do not knowingly collect personal information from children under 13. If you
              believe a child has provided us with personal information, contact us at{" "}
              <a href="mailto:privacy@beworldly.app">privacy@beworldly.app</a> and we will remove it.
            </p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Security</h2>
          <div className={infoSectionBody}>
            <p>
              We use industry-standard practices to protect your information, including encrypted
              connections (HTTPS/TLS), securely hashed passwords, and access controls on our
              database. No method of transmission or storage is 100% secure, but we work to protect
              your information appropriately.
            </p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Changes to this policy</h2>
          <div className={infoSectionBody}>
            <p>
              We may update this policy from time to time. If we make material changes, we&rsquo;ll
              update the &ldquo;Last updated&rdquo; date above.
            </p>
          </div>
        </section>

        <section className={infoSection}>
          <h2 className={infoSectionTitle}>Contact us</h2>
          <div className={infoSectionBody}>
            <p>
              Questions about this policy or your data? Email{" "}
              <a href="mailto:privacy@beworldly.app">privacy@beworldly.app</a>.
            </p>
          </div>
        </section>
    </>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className={infoPage}>
      <AppHeader />

      <main className={infoContent}>
        <Link href="/" className={infoBack}>
          Play now!
        </Link>

        <h1 className={infoTitle}>Privacy Policy</h1>
        <PrivacyPolicyContent />
      </main>
    </div>
  );
}
