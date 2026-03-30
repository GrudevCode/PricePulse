import { SignIn } from '@clerk/react';
import { Zap } from 'lucide-react';

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 flex flex-col items-center">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">PricePulse</h1>
            <p className="text-sm text-muted-foreground mt-1">AI-powered dynamic pricing</p>
          </div>
        </div>

        <SignIn
          fallbackRedirectUrl="/home"
          signUpUrl="/register"
          appearance={{
            elements: {
              rootBox: 'w-full flex justify-center',
            },
          }}
        />
      </div>
    </div>
  );
}
