import { EarlyAccess } from '../_components/EarlyAccess';
import { Features } from '../_components/Features';
import { FinalCta } from '../_components/FinalCta';
import { Hero } from '../_components/Hero';
import { HowItWorks } from '../_components/HowItWorks';
import { Verticals } from '../_components/Verticals';

export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <Verticals />
      <EarlyAccess />
      <FinalCta />
    </>
  );
}
