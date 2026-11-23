import { LegalPage, company } from '@/components/LegalPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Terms of Use | Vitalora' };

export default function Terms() {
  const c = company();
  return (
    <LegalPage title="Terms of Use">
      <p>These terms govern your use of the Vitalora app and website provided by {c.name}. By creating an account you agree to them.</p>
      <h2>1. Wellness, not medical care</h2>
      <p>Vitalora helps you track and reflect on your habits. It does not diagnose, treat or prevent any disease, and its content, scores, calculators and AI suggestions are general information, not medical advice. Always consult a qualified doctor about symptoms, test results or medicines. In an emergency call 112.</p>
      <h2>2. Your account</h2>
      <p>You must be 18 or older and give accurate information. Keep your password safe; you are responsible for activity on your account. Tell us at {c.email} if you suspect unauthorised use.</p>
      <h2>3. Your data</h2>
      <p>You own the data you log. You give us permission to process it to provide the service, as described in the <a href="/privacy">Privacy Policy</a>. You can export or delete it at any time.</p>
      <h2>4. Subscriptions</h2>
      <p>Some features need a Premium or Family plan. Prices are shown in the app in Indian rupees, including applicable taxes. A free trial, when offered, is available once per account. Paid plans run for the period shown and can be cancelled at any time; access continues until the end of the paid period. Refund requests are reviewed case by case in line with applicable consumer law.</p>
      <h2>5. Healthcare professionals</h2>
      <p>Professionals listed in Vitalora are verified for registration before listing, but they provide their services independently and are responsible for their advice. Vitalora is not a party to the consultation.</p>
      <h2>6. Community</h2>
      <p>Be respectful. Do not post medical claims, harmful advice, harassment, hate, spam or other people&apos;s personal data. We may remove content and suspend accounts that break these rules. You can report and block other users.</p>
      <h2>7. Acceptable use</h2>
      <p>Do not misuse the service, attempt to access other people&apos;s data, reverse engineer it, or use it for unlawful purposes.</p>
      <h2>8. Availability and changes</h2>
      <p>We work to keep Vitalora available but cannot guarantee it will be uninterrupted. We may update features and these terms; we will notify you of material changes in the app.</p>
      <h2>9. Liability</h2>
      <p>To the extent the law allows, Vitalora is provided &quot;as is&quot; and we are not liable for indirect losses or for decisions you make based on the app&apos;s information. Nothing in these terms limits liability that cannot be limited by law.</p>
      <h2>10. Law and disputes</h2>
      <p>These terms are governed by the laws of India. Contact {c.email} first; we will try to resolve any issue informally.</p>
    </LegalPage>
  );
}
