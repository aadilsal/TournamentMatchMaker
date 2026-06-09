import { SmoothScroll } from '@/components/landing/SmoothScroll';
import { ScrollProgress } from '@/components/landing/ScrollProgress';
import { LandingNav } from '@/components/landing/LandingNav';
import { HeroSection } from '@/components/landing/HeroSection';
import { StorySection } from '@/components/landing/StorySection';
import { FeaturesBento } from '@/components/landing/FeaturesBento';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { StatsSection } from '@/components/landing/StatsSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';

export function LandingPage() {
  return (
    <SmoothScroll>
      <ScrollProgress />
      <LandingNav />
      <main>
        <HeroSection />
        <StorySection />
        <StatsSection />
        <FeaturesBento />
        <HowItWorks />
        <CTASection />
      </main>
      <LandingFooter />
    </SmoothScroll>
  );
}
