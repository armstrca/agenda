import React, { useState, useEffect } from 'react';
import chroma from 'chroma-js';

const SvgColorizer = ({ svgUrl, primaryColor = '#000' }) => {
    const [svgContent, setSvgContent] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const processSvg = async () => {
            try {
                // Fix for production - handle both dev and prod paths
                const normalizedUrl = svgUrl.startsWith('/') ? svgUrl : `/${svgUrl}`;
                console.log("Fetching SVG from:", normalizedUrl);
                const response = await fetch(normalizedUrl);
                
                if (!response.ok) throw new Error(`Failed to fetch SVG: ${response.status}`);
                const svgText = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(svgText, 'image/svg+xml');

                const parserErrors = doc.getElementsByTagName('parsererror');
                if (parserErrors.length > 0) {
                    throw new Error('SVG XML Error: ' + parserErrors[0].textContent);
                }

                // Calculate color variants FIRST
                const colors = {
                    primary: primaryColor,
                    secondary: chroma.mix(primaryColor, 0.15).hex(),
                    ternary: chroma.mix(primaryColor, 0.05).hex(),
                    quaternary: chroma(primaryColor).darken(0.3).hex()
                };

                // Process all color types
                Object.entries(colors).forEach(([type, hex]) => {
                    doc.querySelectorAll(`[data-color="${type}"]`).forEach(el => {
                        const tag = el.tagName.toLowerCase();

                        // Capture original fill/stroke before removal
                        const hadFill = el.hasAttribute('fill');
                        const hadStroke = el.hasAttribute('stroke');

                        // Clear existing colors
                        el.removeAttribute('fill');
                        el.removeAttribute('stroke');
                        el.removeAttribute('stop-color');

                        // First handle elements that should get fill
                        if (['rect', 'circle', 'ellipse'].includes(tag) || (tag === 'path' && hadFill)) {
                            el.setAttribute('fill', hex);
                        }
                        // Then handle elements that should get stroke
                        else if (['path', 'line', 'polyline', 'polygon'].includes(tag) && hadStroke) {
                            el.setAttribute('stroke', hex);
                        }
                        // Special case for standalone paths (like your circle)
                        else if (tag === 'path' && !hadStroke) {
                            el.setAttribute('fill', hex);
                        }

                        if (tag === 'stop') {
                            el.setAttribute('stop-color', hex);
                        }
                    });
                });

                // Serialize and create URL
                const svgStr = new XMLSerializer().serializeToString(doc);
                const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                setSvgContent(URL.createObjectURL(blob));

            } catch (error) {
                setError(error.message);
                console.error('SVG Error:', error);
            }
        };

        processSvg();
    }, [svgUrl, primaryColor]);

    // if (error) return <div className="svg-error">Error loading background</div>;
    if (!svgContent) return <div className="svg-loading">Loading background...</div>;

    return (
        <img
            src={svgContent}
            alt="Dynamic background"
            style={{
                position: 'absolute',
                zIndex: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                backgroundColor: 'white'
            }}
        />
    );
};

export default SvgColorizer;