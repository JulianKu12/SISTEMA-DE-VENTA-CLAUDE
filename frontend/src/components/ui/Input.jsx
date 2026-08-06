function Input({ label, className = '', rightElement, id, ...props }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          className={`w-full rounded-2xl border-none bg-input px-5 py-4 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40 ${rightElement ? 'pr-12' : ''} ${className}`}
          {...props}
        />
        {rightElement}
      </div>
    </div>
  )
}

export default Input
