import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

export const PasswordStrength: React.FC<PasswordStrengthProps> = ({ 
  password, 
  className 
}) => {
  const requirements = [
    { label: "At least 8 characters", regex: /.{8,}/ },
    { label: "One uppercase letter", regex: /[A-Z]/ },
    { label: "One lowercase letter", regex: /[a-z]/ },
    { label: "One number", regex: /[0-9]/ },
    { label: "One special character", regex: /[^A-Za-z0-9]/ }
  ];

  const getStrength = () => {
    const metRequirements = requirements.filter(req => req.regex.test(password)).length;
    if (metRequirements < 2) return { level: 'weak', color: 'bg-red-500', text: 'Weak' };
    if (metRequirements < 4) return { level: 'medium', color: 'bg-yellow-500', text: 'Medium' };
    if (metRequirements < 5) return { level: 'strong', color: 'bg-blue-500', text: 'Strong' };
    return { level: 'very-strong', color: 'bg-green-500', text: 'Very Strong' };
  };

  const strength = getStrength();
  const metRequirements = requirements.filter(req => req.regex.test(password)).length;

  if (!password) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Strength indicator */}
      <div className="flex items-center space-x-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div 
            className={cn("h-2 rounded-full transition-all", strength.color)}
            style={{ width: `${(metRequirements / requirements.length) * 100}%` }}
          />
        </div>
        <span className={cn(
          "text-xs font-medium",
          strength.level === 'weak' && "text-red-500",
          strength.level === 'medium' && "text-yellow-500", 
          strength.level === 'strong' && "text-blue-500",
          strength.level === 'very-strong' && "text-green-500"
        )}>
          {strength.text}
        </span>
      </div>

      {/* Requirements checklist */}
      <div className="space-y-1">
        {requirements.map((req, index) => {
          const isMet = req.regex.test(password);
          return (
            <div key={index} className="flex items-center space-x-2 text-xs">
              {isMet ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <X className="w-3 h-3 text-gray-400" />
              )}
              <span className={cn(
                isMet ? "text-green-700" : "text-gray-500"
              )}>
                {req.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};