import { HiIdentification, HiQrcode, HiShieldCheck } from 'react-icons/hi';
import VerifyForm from '@/components/membership/VerifyForm';

const STEPS = [
  { icon: HiQrcode, title: 'Scan the QR code', text: 'Point a phone camera at the code on the card. It opens this page with the result.' },
  { icon: HiIdentification, title: 'Or type the number', text: 'Enter the member number printed on the card, such as EESA-26-7K3M9Q.' },
  { icon: HiShieldCheck, title: 'Compare the photo', text: 'A genuine card shows the same photo and name here as on the card.' },
];

export default function VerifyPage() {
  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-3xl sm:text-5xl font-bold mb-4">Verify a membership card</h1>
          <p className="text-lg text-white/85 mb-8">
            Check that an EESA card is genuine and that the member&apos;s subscription is current.
          </p>
          <VerifyForm />
        </div>
      </section>

      <section className="py-14 bg-canvas">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card">
              <span className="w-11 h-11 rounded-xl bg-primary-500/10 flex items-center justify-center mb-3">
                <Icon className="w-6 h-6 text-primary-500 dark:text-primary-300" aria-hidden="true" />
              </span>
              <h2 className="font-semibold text-strong">{title}</h2>
              <p className="text-sm text-muted-fg mt-1">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
