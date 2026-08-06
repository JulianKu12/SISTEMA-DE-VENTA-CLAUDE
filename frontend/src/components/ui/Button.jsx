const estilosBase =
  'inline-flex select-none items-center justify-center gap-2 rounded-3xl font-semibold transition duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]'

const variantes = {
  primary:
    'bg-accent text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] active:bg-accent/85',
  secondary:
    'bg-card text-accent shadow-card active:bg-muted/10',
}

const tamanos = {
  lg: 'min-h-14 px-8 py-4 text-lg',
  md: 'min-h-12 px-5 py-3 text-base',
}

function Button({
  variant = 'primary',
  size = 'lg',
  type = 'button',
  className = '',
  ...props
}) {
  const clases = `${estilosBase} ${variantes[variant]} ${tamanos[size]} ${className}`
  return <button type={type} className={clases} {...props} />
}

export default Button
