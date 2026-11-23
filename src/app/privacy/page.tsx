import { LegalPage, company } from '@/components/LegalPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Privacy Policy | Vitalora' };

export default function Privacy() {
  const c = company();
  return (
    <LegalPage title="Privacy Policy">
      <p>{c.name} (&quot;Vitalora&quot;, &quot;we&quot;) runs the Vitalora wellness app and website. This policy explains what personal data we process, why, and the rights you have under India&apos;s Digital Personal Data Protection Act, 2023 and other laws that apply to you.</p>
      <h2>Data we collect</h2>
      <ul>
        <li><b>Account:</b> name, email or phone number, password (stored only as a secure hash), language and time zone.</li>
        <li><b>Health and wellness data you log or connect:</b> activity and steps, workouts, food and water, sleep, mood and stress, journal entries, habits, meditation, and body measurements such as weight, heart rate and blood pressure. Each record shows whether it was entered by you, imported from a device, or estimated.</li>
        <li><b>Connected devices:</b> if you choose to connect a wearable or Apple Health / Health Connect, the data types shown on the consent screen.</li>
        <li><b>AI features:</b> the messages, photos and text you send to the AI coach or AI tools, and the replies.</li>
        <li><b>Appointments, payments and support:</b> appointment details you add, subscription and payment records (card details are handled by the payment provider, not stored by us), and support conversations.</li>
        <li><b>Technical:</b> device type, push token if you enable notifications, IP address and security logs.</li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>To provide the service: dashboards, insights, reminders, plans and AI suggestions based on your own data.</li>
        <li>To keep your account secure, prevent abuse and meet legal obligations.</li>
        <li>To process payments and provide support.</li>
      </ul>
      <p>We process health data only with your consent, which you give when you create an account and each time you connect a device. You can withdraw consent at any time in the app; this stops further processing for that purpose.</p>
      <h2>AI processing</h2>
      <p>When you use AI features, the relevant data (for example a summary of your last 7 days, or the photo you upload) is sent to our AI provider to generate the reply. Providers process it on our behalf and may not use it to train their models under our agreements. AI suggestions are general wellness information, not medical advice.</p>
      <h2>Sharing</h2>
      <p>We do not sell your data or use it for advertising. We share data only with service providers that run Vitalora for us (hosting, database, AI, email/SMS/push, payments, video consultations), with a healthcare professional you choose to book, or where the law requires.</p>
      <h2>Security</h2>
      <p>Data is encrypted in transit (HTTPS). Journal entries, notes, AI conversations and connected-device tokens are additionally encrypted in our database. Access by our staff is limited by role and recorded in audit logs; support staff cannot see your health logs or journal.</p>
      <h2>Retention</h2>
      <p>We keep your data while your account is active. When you delete your account, your personal data is erased immediately; payment records we must keep by law are retained in anonymised form.</p>
      <h2>Your rights</h2>
      <ul>
        <li>Access and download all your data (Account → Export my data).</li>
        <li>Correct your profile and records at any time.</li>
        <li>Erase your account and data (Account → Delete my account).</li>
        <li>Withdraw consent for health data, devices or marketing.</li>
        <li>Nominate another person to exercise your rights in case of death or incapacity, by writing to us.</li>
        <li>Raise a grievance with us, and if unresolved, with the Data Protection Board of India.</li>
      </ul>
      <h2>Children</h2>
      <p>Vitalora is for people aged 18 and over. We do not knowingly create accounts for children.</p>
      <h2>Contact and grievance officer</h2>
      <p>{c.grievance}<br />Email: {c.grievanceEmail}<br />{c.address}</p>
      <p>We reply to grievances within 30 days.</p>
      <h2>Not a medical service</h2>
      <p>Vitalora supports general wellness and is not a medical device. In an emergency call 112. For mental-health support in India, call Tele-MANAS on 14416 (free, 24x7).</p>
    </LegalPage>
  );
}
