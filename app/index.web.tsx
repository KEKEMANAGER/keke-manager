import { LandingPage } from '../components/landing/LandingPage';
import { WebSessionRedirect } from '../components/WebSessionRedirect';

/** Eager landing import — homepage LCP must not wait on a lazy chunk. */
export default function IndexWeb() {
  return (
    <>
      <WebSessionRedirect />
      <LandingPage />
    </>
  );
}
