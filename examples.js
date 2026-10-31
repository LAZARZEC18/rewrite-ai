// Templates: real situations with a rough sample draft. Each one carries three
// hand-written rewrites so demo mode can show the full experience without an API.

export const TEMPLATES = [
  {
    id: "extension",
    title: "Ask for an extension",
    blurb: "A late assignment and a reason you can back up.",
    tone: "professional", channel: "email", audience: "my lecturer, Dr Reid",
    input: "hey, so i wont be able to get the lab report in by friday cause ive been sick most of this week and also had a shift at work i couldnt get out of. can i get an extension till monday or something? i can send a med cert if u need it. sorry about this",
    versions: [
`Subject: Extension request for Friday's lab report

Hi Dr Reid,

I won't be able to submit the lab report by Friday because I've been sick for most of this week and also had a work shift I couldn't get out of. Could I please have an extension until Monday? I can send a medical certificate if you need one.

Sorry about this, and thank you for considering it.

Kind regards,
[Your name]`,
`Subject: Lab report: could I submit on Monday?

Hi Dr Reid,

I've been unwell for most of this week, and with a work shift I couldn't move, I've fallen behind on the lab report due this Friday. Would it be possible to submit it on Monday instead?

I have a medical certificate and can send it through today if that helps.

Thank you for your understanding.

Kind regards,
[Your name]`,
`Subject: Extension request: lab report

Hi Dr Reid,

I've been sick most of this week and had a work shift I couldn't miss, so I won't make Friday's deadline for the lab report. Could I have until Monday? I can send a medical certificate.

Thanks for your understanding,
[Your name]`,
    ],
  },
  {
    id: "invoice",
    title: "Chase an unpaid invoice",
    blurb: "Firm about the money, friendly about the client.",
    tone: "confident", channel: "email", audience: "a client, Jess",
    input: "hi jess, just checking in about invoice 1042 for the website work, it was due on the 3rd and i havent seen payment come thru yet. not sure if it got lost or something. could you have a look when u get a chance? the total was $1,850. thanks",
    versions: [
`Subject: Invoice 1042 is now overdue

Hi Jess,

I'm following up on invoice 1042 for the website work. It was due on the 3rd, and I haven't received payment yet. The total is $1,850.

Could you please check on it and let me know when I can expect payment? I'm happy to resend the invoice if it went astray.

Thanks,
[Your name]`,
`Subject: Payment for invoice 1042 ($1,850)

Hi Jess,

A quick note on invoice 1042 for the website work: the $1,850 was due on the 3rd and hasn't come through yet.

If it's been missed, I can send another copy today. Otherwise, could you confirm a payment date by the end of this week?

Thanks for sorting this out,
[Your name]`,
`Subject: Overdue: invoice 1042

Hi Jess,

Invoice 1042 ($1,850, website work) was due on the 3rd and is still unpaid. Could you arrange payment or let me know the expected date?

Thanks,
[Your name]`,
    ],
  },
  {
    id: "meeting",
    title: "Decline a meeting",
    blurb: "Say no without seeming unhelpful.",
    tone: "decline", channel: "slack", audience: "a teammate, Priya",
    input: "hey priya, thanks for the invite to the thursday 2pm sync but i dont think i need to be there, i'm flat out finishing the q3 report. can you send me notes after? if anything needs my input im happy to jump in for 10 mins",
    versions: [
`Hi Priya, thanks for the invite to Thursday's 2pm sync. I'm going to skip this one so I can finish the Q3 report. Could you send me the notes afterwards? If anything needs my input, I'm happy to jump in for 10 minutes.`,
`Thanks for the invite, Priya. I'll sit out Thursday's 2pm sync, as I'm heads down on the Q3 report.

- Could you share the notes after?
- If something needs my input, ping me and I'll join for 10 minutes.`,
`Hi Priya, I'll pass on Thursday's sync to finish the Q3 report. Notes afterwards would be great, and I can join for 10 minutes if you need me.`,
    ],
  },
  {
    id: "landlord",
    title: "Complain to a landlord",
    blurb: "Clear facts, a firm ask and a deadline.",
    tone: "confident", channel: "email", audience: "my property manager",
    input: "hi, the hot water in unit 4 has been broken since last tuesday. i reported it on the portal twice and no one has come out. its been over a week of cold showers which isnt ok. can someone please fix this asap, i'm home most afternoons. thanks",
    versions: [
`Subject: Urgent repair: no hot water in unit 4

Hi [Property manager's name],

The hot water in unit 4 has not worked since last Tuesday. I've reported it through the portal twice, but no one has come out yet, and it's now been more than a week without hot water.

Please arrange for a plumber to fix this as soon as possible. I'm home most afternoons to let them in.

Thanks,
[Your name]`,
`Subject: Hot water still not working in unit 4 (reported twice)

Hi [Property manager's name],

I'm writing about the hot water in unit 4, which has been out since last Tuesday. I've lodged two requests on the portal with no response, and more than a week without hot water isn't acceptable.

Could you confirm by tomorrow when a plumber will attend? I'm home most afternoons, so any time after 12pm works.

Regards,
[Your name]`,
`Subject: No hot water in unit 4 since last Tuesday

Hi [Property manager's name],

Unit 4 has had no hot water since last Tuesday, despite two portal requests. Please send someone to fix it urgently. I'm home most afternoons.

Thanks,
[Your name]`,
    ],
  },
  {
    id: "late-order",
    title: "Apologise to a customer",
    blurb: "Own the delay and say what happens next.",
    tone: "apology", channel: "email", audience: "a customer, Mr Patel",
    input: "hi mr patel, sorry your order hasnt arrived yet. our supplier was late sending us the lights so we couldnt ship on time. it should go out tomorrow and you'll get tracking. sorry again",
    versions: [
`Subject: An update on your order, and an apology

Hi Mr Patel,

I'm sorry your order hasn't arrived yet. Our supplier was late delivering the lights to us, so we couldn't ship on time.

Your order will go out tomorrow, and you'll receive a tracking link as soon as it's on its way.

Thank you for your patience, and sorry again for the wait.

Kind regards,
[Your name]`,
`Subject: Your order ships tomorrow

Hi Mr Patel,

Thank you for your patience, and I'm sorry for the delay with your order. A late delivery from our supplier held up your lights, and we should have let you know sooner.

The good news is that your order ships tomorrow. We'll email your tracking details the moment it leaves us.

Kind regards,
[Your name]`,
`Subject: Sorry for the delay with your order

Hi Mr Patel,

Sorry your order is late. Our supplier delayed the lights, but your order ships tomorrow and you'll get tracking straight away.

Kind regards,
[Your name]`,
    ],
  },
  {
    id: "linkedin",
    title: "Reach out on LinkedIn",
    blurb: "A short, specific ask a stranger will say yes to.",
    tone: "persuasive", channel: "linkedin", audience: "an engineer whose work I admire",
    input: "hi daniel, im a second year electrical engineering student and i saw you work on the solar projects at your company. i'd love to hear how you got into it. would you be up for a quick 15 min call sometime? no worries if not",
    versions: [
`Hi Daniel,

I'm a second-year electrical engineering student, and I came across your work on your company's solar projects. It's exactly the kind of work I'm hoping to do after I graduate.

Would you be open to a quick 15-minute call to share how you got into it? I'm happy to work around your schedule.

Thanks,
[Your name]`,
`Hi Daniel,

Your solar projects caught my eye. As a second-year electrical engineering student, I'm trying to understand the path into renewable energy, and your experience would help a lot.

Could I borrow 15 minutes of your time for a call in the next few weeks? I'll come with specific questions so it's worth your while.

Thanks so much,
[Your name]`,
`Hi Daniel,

I'm a second-year electrical engineering student interested in solar. Would you be up for a 15-minute call about how you got into your role? Any time that suits you works for me.

Thanks,
[Your name]`,
    ],
  },
  {
    id: "friend",
    title: "Cancel plans with a friend",
    blurb: "Back out kindly and make it up to them.",
    tone: "friendly", channel: "text", audience: "a close friend",
    input: "hey sorry man i cant come saturday anymore, got called in for a shift. i feel bad cause i said id be there. can we do next weekend instead? ill shout lunch",
    versions: [
`Hey, really sorry, I can't make Saturday anymore. I got called in for a shift. I feel bad because I said I'd be there. Can we do next weekend instead? Lunch is on me.`,
`Mate, I'm gutted. Work just called me in for Saturday, so I have to bail. Sorry, I know I said I'd be there. Next weekend? I'll shout lunch to make up for it.`,
`Sorry, got called in for a shift Saturday so I can't come. Next weekend instead? Lunch is on me.`,
    ],
  },
  {
    id: "pay-review",
    title: "Ask for a pay review",
    blurb: "Make the case without apologising for asking.",
    tone: "confident", channel: "email", audience: "my manager, Karen",
    input: "hi karen, i was wondering if maybe we could talk about my pay at some point? ive been here a year now and i've taken on training new starters and the weekly stock reports on top of my normal role. no pressure if now isnt a good time",
    versions: [
`Subject: Time for a pay review?

Hi Karen,

I'd like to set up a time to talk about my pay. I've now been here a year, and in that time I've taken on training new starters and the weekly stock reports on top of my normal role.

Could we find 30 minutes in the next couple of weeks?

Thanks,
[Your name]`,
`Subject: Request for a pay review

Hi Karen,

Now that I've reached a year here, I'd like to request a pay review. Alongside my normal role, I've taken on two extra responsibilities: training new starters and preparing the weekly stock reports.

I'd appreciate a chance to discuss this. Would a meeting sometime next week work for you?

Kind regards,
[Your name]`,
`Subject: Pay review

Hi Karen,

I've been here a year and now also train new starters and run the weekly stock reports. Could we meet in the next fortnight to review my pay?

Thanks,
[Your name]`,
    ],
  },
];

/** Find the template whose sample draft matches this text (ignoring spacing and case). */
export function matchTemplate(text) {
  const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const t = norm(text);
  return TEMPLATES.find((x) => norm(x.input) === t) || null;
}

/** Build the same tagged stream a real reply would produce, for demo playback. */
export function demoStream(template, n) {
  return template.versions.slice(0, n).map((v) => `<version>${v}</version>`).join("\n");
}
