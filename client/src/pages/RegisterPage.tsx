import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AmpLogo } from '../components/AmpLogo';
import { getErrorMessage } from '../utils/format';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEN_DIGITS_REGEX = /^\d{10}$/;

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    const cleanMobile = mobileNumber.trim();

    if (!cleanName || !cleanEmail || !cleanMobile || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!TEN_DIGITS_REGEX.test(cleanMobile)) {
      setError('Mobile number must be exactly 10 digits.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { autoLoggedIn } = await register({
        fullName: cleanName,
        email: cleanEmail,
        mobileNumber: cleanMobile,
        password,
        confirmPassword,
      });

      if (autoLoggedIn) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/login', {
          replace: true,
          state: { message: 'Account created. Please sign in.' },
        });
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-page-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[400px] bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex justify-center w-full mb-3">
            <AmpLogo className="h-10 w-auto" />
          </div>
          <h1 className="text-xl font-bold text-text-main">Call Tracker</h1>
          <p className="text-sm text-text-muted mt-1">
            Create your coordinator account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="register-fullname"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              Full name
            </label>
            <input
              id="register-fullname"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full h-[44px] px-3.5 rounded-lg border border-gray-300 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
            />
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              Email
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-[44px] px-3.5 rounded-lg border border-gray-300 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
            />
          </div>

          <div>
            <label
              htmlFor="register-mobile"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              Mobile number
            </label>
            <input
              id="register-mobile"
              type="tel"
              autoComplete="tel"
              maxLength={10}
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full h-[44px] px-3.5 rounded-lg border border-gray-300 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full h-[44px] pl-3.5 pr-10 rounded-lg border border-gray-300 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="register-confirm-password"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              Confirm password
            </label>
            <div className="relative">
              <input
                id="register-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full h-[44px] pl-3.5 pr-10 rounded-lg border border-gray-300 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-[44px] rounded-lg bg-maroon hover:bg-maroon-hover disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-text-muted">
          <Link
            to="/login"
            className="text-maroon hover:text-maroon-hover font-medium hover:underline"
          >
            Already registered? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
