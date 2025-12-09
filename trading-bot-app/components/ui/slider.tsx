"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ value, onValueChange, min = 0, max = 100, step = 1, className, id, ...props }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100
    const [generatedId] = React.useState(() => `slider-${Math.random().toString(36).substring(2, 11)}`)
    const sliderId = id || generatedId

    React.useEffect(() => {
      const style = document.createElement('style')
      style.id = `slider-style-${sliderId}`
      style.textContent = `
        #${sliderId}::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: hsl(var(--primary));
          border: 2px solid hsl(var(--background));
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        #${sliderId}::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: hsl(var(--primary));
          border: 2px solid hsl(var(--background));
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `
      document.head.appendChild(style)
      return () => {
        const existingStyle = document.getElementById(`slider-style-${sliderId}`)
        if (existingStyle) {
          document.head.removeChild(existingStyle)
        }
      }
    }, [sliderId])

    return (
      <div className={cn("relative flex w-full items-center", className)}>
        <input
          ref={ref}
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onValueChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${percentage}%, hsl(var(--secondary)) ${percentage}%, hsl(var(--secondary)) 100%)`,
          }}
          {...props}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }

