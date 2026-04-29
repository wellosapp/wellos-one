import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="flex justify-center px-s4 py-s12">
      <SignIn />
    </main>
  );
}
