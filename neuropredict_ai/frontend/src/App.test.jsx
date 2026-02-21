import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

describe('App', () => {
    it('renders the dashboard title', () => {
        render(<App />);
        expect(screen.getByText('NeuroPredict AI')).toBeInTheDocument();
    });

    it('renders the file upload input', () => {
        render(<App />);
        expect(screen.getByText('Analyze CTA Scan')).toBeInTheDocument();
    });

    it('renders the upload button as disabled without a file', () => {
        render(<App />);
        const button = screen.getByText('Analyze CTA Scan');
        expect(button).toBeDisabled();
    });
});
