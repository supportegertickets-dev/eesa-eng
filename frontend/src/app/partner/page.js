'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiAcademicCap, HiBriefcase, HiCheckCircle, HiChip, HiGlobe, HiLightBulb, HiMicrophone, HiSparkles, HiSpeakerphone, HiUserGroup, HiCheck,
} from 'react-icons/hi';
import { getSponsors, getUserStats, sendContact } from '@/lib/api';
import { DEPARTMENT_PROFILES } from '@/lib/departments';

const REASONS = [
  { icon: HiAcademicCap, title: 'Meet tomorrow’s engineers', text: 'Get to know civil, mechanical, electrical, agricultural and industrial engineering students before they graduate.' },
  { icon: HiSpeakerphone, title: 'Be seen on campus', text: 'Your brand at our events, on our website and across our social channels.' },
  { icon: HiLightBulb, title: 'Shape practical skills', text: 'Bring industry problems to student projects and help close the gap between the classroom and the field.' },
  { icon: HiGlobe, title: 'Give back', text: 'Support outreach and community projects led by students in Njoro and beyond.' },
];

const WAYS = [
  { id: 'Event sponsorship', icon: HiSparkles, text: 'Sponsor a workshop, hackathon, engineering week or our annual dinner.' },
  { id: 'Attachments and internships', icon: HiBriefcase, text: 'Offer industrial attachment and internship places to members.' },
  { id: 'Mentorship and talks', icon: HiMicrophone, text: 'Send engineers to give talks, run site visits or mentor students.' },
  { id: 'Project funding', icon: HiLightBulb, text: 'Fund student design, research and competition projects.' },
  { id: 'Equipment and in-kind support', icon: HiChip, text: 'Donate tools, software licences or lab equipment.' },
  { id: 'Recruitment', icon: HiUserGroup, text: 'Meet graduating students at career fairs and recruitment drives.' },
];

const TIERS = [
  { name: 'Platinum', tone: 'from-slate-200 to-slate-400 text-slate-900', benefits: ['Headline partner of a flagship event', 'Logo on the home page and event materials', 'Speaking slot and exhibition space', 'Priority at recruitment and career events'] },
  { name: 'Gold', tone: 'from-accent-200 to-accent-500 text-primary-900', benefits: ['Named sponsor of an event or programme', 'Logo on the partners page and event banners', 'Exhibition space at events'] },
  { name: 'Silver', tone: 'from-gray-100 to-gray-300 text-gray-900', benefits: ['Logo on the partners page', 'Recognition at events', 'Posts on our social channels'] },
  { name: 'Bronze', tone: 'from-orange-200 to-orange-400 text-orange-950', benefits: ['Name on the partners page', 'Thanks at events'] },
];

const emptyForm = { organization: '', name: '', email: '', phone: '', interest: WAYS[0].id, message: '' };

export default function PartnerPage() {
  const [stats, setStats] = useState(null);
  const [sponsors, setSponsors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getUserStats().then(setStats).catch(() => {});
    getSponsors().then((data) => setSponsors(data.sponsors || [])).catch(() => {});
  }, []);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      await sendContact({
        category: 'partnership',
        organization: form.organization.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        interest: form.interest,
        subject: `Partnership enquiry: ${form.organization.trim()}`,
        message: form.message.trim(),
      });
      setSent(true);
      setForm(emptyForm);
    } catch (error) {
      toast.error(error.message || 'Your enquiry could not be sent.');
    } finally {
      setSending(false);
    }
  };

  // Head counts are shown once they are large enough to be worth quoting to a sponsor.
  const MIN_QUOTED = 50;
  const figures = [
    { value: stats?.total >= MIN_QUOTED ? stats.total : null, label: 'Members' },
    { value: DEPARTMENT_PROFILES.length, label: 'Engineering disciplines' },
    { value: stats?.alumni >= MIN_QUOTED ? stats.alumni : null, label: 'Alumni in industry' },
  ].filter((figure) => figure.value);

  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-accent-400 font-semibold uppercase tracking-wide text-sm">Partner with us</p>
            <h1 className="font-heading text-4xl sm:text-5xl font-bold mt-3">Invest in the next generation of Kenyan engineers</h1>
            <p className="text-lg text-white/85 mt-5">
              The Egerton Engineering Student Association connects companies, institutions and alumni with engineering students at Egerton University.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#enquiry" className="btn-accent text-base px-6 py-3">Start a conversation</a>
              <a href="#ways" className="btn border border-white/40 text-white hover:bg-white/10 text-base px-6 py-3">Ways to partner</a>
            </div>
          </div>

          {figures.length > 0 && (
            <dl className="mt-12 grid grid-cols-3 gap-4 max-w-2xl">
              {figures.map((figure) => (
                <div key={figure.label}>
                  <dt className="text-sm text-white/75">{figure.label}</dt>
                  <dd className="font-heading text-3xl sm:text-4xl font-bold text-accent-400 tabular-nums">{Number(figure.value).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="section-title">Why partner with EESA</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <span className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary-500 dark:text-primary-300" aria-hidden="true" />
                </span>
                <h3 className="font-semibold text-strong mt-4">{title}</h3>
                <p className="text-sm text-muted-fg mt-1.5 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ways" className="py-16 sm:py-20 bg-canvas scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="section-title">Ways to partner</h2>
          <p className="section-subtitle mt-3">Choose one, or combine several into a package that suits your organisation.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WAYS.map(({ id, icon: Icon, text }) => (
              <div key={id} className="card flex gap-4">
                <Icon className="w-7 h-7 text-accent-600 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold text-strong">{id}</h3>
                  <p className="text-sm text-muted-fg mt-1">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="section-title">Partnership levels</h2>
          <p className="section-subtitle mt-3">Every package is agreed with you. Ask us for the current prospectus.</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => (
              <div key={tier.name} className="card p-0 overflow-hidden">
                <div className={`bg-gradient-to-br ${tier.tone} px-5 py-4`}>
                  <h3 className="font-heading text-xl font-bold">{tier.name}</h3>
                </div>
                <ul className="p-5 space-y-2.5">
                  {tier.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-sm text-body">
                      <HiCheck className="w-4 h-4 mt-0.5 text-success shrink-0" aria-hidden="true" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {sponsors.length > 0 && (
        <section className="py-16 bg-canvas">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="section-title">Our partners</h2>
            <p className="section-subtitle mx-auto mt-3">Organisations already supporting EESA.</p>
            <ul className="mt-10 flex flex-wrap justify-center gap-6">
              {sponsors.map((sponsor) => {
                const content = (
                  <>
                    {sponsor.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sponsor.logo} alt="" className="w-20 h-20 object-contain" loading="lazy" />
                    ) : (
                      <span className="w-20 h-20 rounded-full bg-muted flex items-center justify-center font-heading text-2xl font-bold text-faint">{sponsor.name.charAt(0)}</span>
                    )}
                    <span className="mt-3 text-sm font-medium text-strong">{sponsor.name}</span>
                    <span className="text-xs text-subtle capitalize">{sponsor.tier}</span>
                  </>
                );
                return (
                  <li key={sponsor._id}>
                    {sponsor.website ? (
                      <a href={sponsor.website} target="_blank" rel="noopener noreferrer" className="card w-44 flex flex-col items-center hover:shadow-raised transition-shadow">{content}</a>
                    ) : (
                      <div className="card w-44 flex flex-col items-center">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <section id="enquiry" className="py-16 sm:py-20 bg-surface scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="section-title text-center">Start a conversation</h2>
          <p className="section-subtitle mx-auto text-center mt-3">Tell us what you have in mind and the association&apos;s leadership will get back to you.</p>

          {sent ? (
            <div className="card mt-10 text-center py-12" role="status">
              <HiCheckCircle className="w-14 h-14 text-success mx-auto" aria-hidden="true" />
              <h3 className="font-heading text-xl font-semibold text-strong mt-4">Thank you</h3>
              <p className="text-muted-fg mt-2">Your enquiry has reached the EESA leadership. We will reply by email.</p>
              <button type="button" className="btn-ghost mt-6" onClick={() => setSent(false)}>Send another enquiry</button>
            </div>
          ) : (
            <form onSubmit={submit} className="card mt-10 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="partner-organization" className="form-label">Organisation<span className="text-danger"> *</span></label>
                <input id="partner-organization" className="input-field" required maxLength={150} value={form.organization} onChange={set('organization')} autoComplete="organization" />
              </div>
              <div>
                <label htmlFor="partner-name" className="form-label">Your name<span className="text-danger"> *</span></label>
                <input id="partner-name" className="input-field" required maxLength={100} value={form.name} onChange={set('name')} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="partner-email" className="form-label">Email<span className="text-danger"> *</span></label>
                <input id="partner-email" type="email" className="input-field" required value={form.email} onChange={set('email')} autoComplete="email" />
              </div>
              <div>
                <label htmlFor="partner-phone" className="form-label">Phone</label>
                <input id="partner-phone" type="tel" className="input-field" maxLength={30} value={form.phone} onChange={set('phone')} autoComplete="tel" />
              </div>
              <div>
                <label htmlFor="partner-interest" className="form-label">Interested in</label>
                <select id="partner-interest" className="input-field" value={form.interest} onChange={set('interest')}>
                  {WAYS.map((way) => <option key={way.id} value={way.id}>{way.id}</option>)}
                  <option value="Something else">Something else</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="partner-message" className="form-label">Message<span className="text-danger"> *</span></label>
                <textarea id="partner-message" className="input-field" rows={5} required maxLength={3000} value={form.message} onChange={set('message')} placeholder="What would you like to do together?" />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn-primary w-full sm:w-auto" disabled={sending}>
                  {sending ? 'Sending…' : 'Send enquiry'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
