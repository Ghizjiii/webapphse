interface BrandLogoProps {
  variant?: 'light' | 'dark';
  className?: string;
}

export default function BrandLogo({ variant = 'light', className = '' }: BrandLogoProps) {
  const src = variant === 'dark' ? '/brand/logo-black.png' : '/brand/logo-white.png';

  return (
    <img
      src={src}
      alt="HSE Company"
      className={className}
      draggable={false}
    />
  );
}
