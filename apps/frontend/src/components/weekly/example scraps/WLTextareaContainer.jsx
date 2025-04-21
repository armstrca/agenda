import React from 'react';
import Tiptap from '../../Tiptap';

const WLTextareaContainer = ({ id }) => {
    return (
        <div className="textarea-container">
            <img
                className="divider-container"
                alt="weekly left divider line"
                src="https://c.animaapp.com/eFfbxFd7/img/wl-divider-line-5.svg"
            />
            <div className="textarea-bg">
                <img
                    className="wl-input-line-4"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/wl-input-line-28.svg"
                />
                <img
                    className="wl-input-line-3"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/wl-input-line-28.svg"
                />
                <img
                    className="wl-input-line-2"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/wl-input-line-28.svg"
                />
                <img
                    className="wl-input-line-1"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/wl-input-line-28.svg"
                />
                <Tiptap id={id} />
            </div>
        </div>
    );
};

export default WLTextareaContainer;