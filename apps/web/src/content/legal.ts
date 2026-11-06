// DRAFT — legal must review and approve this copy before launch.

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const CONTACT = 'Questions? Email support@pixelpaddle.com.';

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: '6 November 2026',
  intro:
    'These terms cover your use of VR Cricket League, run by TechVersa: the website, player accounts, tournaments, venue bookings and the Meta Quest headset link. By creating an account you agree to them.',
  sections: [
    {
      heading: 'Your account',
      body: [
        'You need an account to enter tournaments, book venue slots or play matches. Give us a real email address and keep your password to yourself — you are responsible for what happens under your account.',
        'One account per person. Your username and profile photo are public, so do not use anything offensive or that impersonates someone else. We may rename or suspend accounts that break these terms.',
      ],
    },
    {
      heading: 'Tournaments and matches',
      body: [
        'We pair you with opponents automatically. Scores are recorded from your linked Meta Quest headset; do not tamper with scores, the headset link or the game.',
        'If you miss a confirmed match or your play window closes, the match may be expired or awarded to your opponent. Tied matches are replayed.',
        'Organisers may correct results, remove players who cheat or abuse others, and change or cancel a tournament if they have to. We will tell affected players when that happens.',
      ],
    },
    {
      heading: 'Venue bookings',
      body: [
        'Venue slots are limited. Cancel a booking you cannot use so someone else can play. Each venue may have its own house rules, which you must follow while you are there.',
      ],
    },
    {
      heading: 'Payments and buybacks',
      body: [
        'Some tournaments let an eliminated player buy back in for a fee shown before you pay. Payments are processed by Stripe; we never see or store your card number.',
        'A buyback is used as soon as it is applied to your tournament entry. If we cannot apply a buyback you paid for, we refund it.',
      ],
    },
    {
      heading: 'Fair play and conduct',
      body: [
        'No cheating, harassment, hate speech, or attempts to break, overload or get around the security of the service. We may remove content, void results or close accounts that do.',
      ],
    },
    {
      heading: 'The service',
      body: [
        'We work to keep the service running but cannot promise it will always be available or error-free. To the extent the law allows, we are not liable for indirect losses from using it.',
        'We may update these terms. If a change matters, we will tell you before it takes effect; continuing to use the service means you accept the new terms.',
        CONTACT,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: '6 November 2026',
  intro:
    'This explains what VR Cricket League (run by TechVersa) collects about you, why, and who we share it with. We only collect what we need to run tournaments, bookings and matches.',
  sections: [
    {
      heading: 'What we collect',
      body: [
        'Account details: your email address, username, password (stored only as a one-way hash) and, if you upload one, a profile photo.',
        'Location: the country and city you give us. If you tap "use my location", your browser shares your approximate coordinates so we can suggest nearby venues. We also estimate your rough location from your IP address for the same purpose.',
        'VR headset: whether you have a headset and which model, and a link code that connects your Meta Quest to your account.',
        'Play data: tournaments you enter, venue bookings, matches, scores, wins, losses, rating and skill tier.',
        'Payments: when you buy back into a tournament, Stripe processes the card payment. We keep the amount, status and Stripe payment reference — never your card number.',
        'Technical data: your IP address and basic request logs, used to keep the service secure and working.',
      ],
    },
    {
      heading: 'How we use it',
      body: [
        'To run your account, pair you with opponents of a similar level, record results, manage venue bookings, take buyback payments, and send you notifications about your matches and bookings.',
        'To prevent cheating, abuse and fraud, and to fix problems.',
        'We do not sell your personal data, and we do not use it for advertising.',
      ],
    },
    {
      heading: 'What others can see',
      body: [
        'Your public profile shows your username, profile photo and match record. Opponents and tournament organisers see your username and match results. Venue and tournament admins see the bookings and entries for the venues and tournaments they run, including your email address.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'Stripe, to process payments. Our email provider, to send notifications. Location lookup services, which receive a city name, coordinates or IP address to find nearby venues. Meta Quest headsets you link, which receive your current match details.',
        'We may also disclose data if the law requires it.',
      ],
    },
    {
      heading: 'Storage and security',
      body: [
        'Your session is kept in your browser (a sign-in token and a secure, HTTP-only cookie). We keep your data while your account is open and for a limited time afterwards where we need it for records, disputes or the law.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'You can update your profile at any time. You can ask us for a copy of your data, to correct it, or to delete your account by emailing us. Some match and payment records may be kept where we are required to.',
        CONTACT,
      ],
    },
  ],
};
