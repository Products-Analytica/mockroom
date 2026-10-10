import Link from 'next/link';

export const metadata = { title: 'Privacy Policy – Mock Interview Room (Analytica, SBM NMIMS Mumbai)' };

const SUPPORT_EMAIL = 'productsanalytica@gmail.com';
const Email = () => SUPPORT_EMAIL.includes('@') ? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : <>{SUPPORT_EMAIL}</>;

export default function Privacy(){
  return (
    <section className="inner">
      <nav className="nav"><Link href="/" className="brand">Mock Interview Room</Link></nav>
      <p className="eyebrow">Analytica, SBM NMIMS Mumbai</p>
      <h1>Privacy Policy</h1>
      <p className="lede">How the Mock Interview Room handles your data.</p>
      <p className="hint">Last updated: 10 October 2026</p>

      <h2>What we collect</h2>
      <p>Only your Google account name and email (for sign-in), and the full name and SAP ID you enter.</p>

      <h2>What stays on your device</h2>
      <p>Your resume, the job descriptions you paste, your answers, your interview reports, scores and feedback, and your Gemini API key are stored only in your browser and are never sent to our database.</p>

      <h2>Who sees your data</h2>
      <p>Analytica committee members see your name, SAP ID and email to approve access.</p>

      <h2>Third-party services</h2>
      <ul>
        <li><strong>Supabase:</strong> sign-in and database.</li>
        <li><strong>Vercel:</strong> hosting.</li>
        <li><strong>Google:</strong> sign-in, and the Gemini AI that you connect with your own API key. Google's terms apply to that key.</li>
        <li><strong>Your browser's speech recognition service:</strong> transcribes spoken answers.</li>
      </ul>

      <h2>Data retention</h2>
      <p>We delete all profiles (name, email, SAP ID) after the placement season ends, and within 30 days of any deletion request.</p>

      <h2>Deleting your data</h2>
      <p>Email <Email /> to have your account deleted. Your interviews are stored only in your browser, and you can delete them yourself from your dashboard.</p>

      <h2>Contact</h2>
      <p><Email /></p>

      <div className="actions"><Link href="/" className="button">Back to Mock Interview Room</Link></div>
    </section>
  );
}
