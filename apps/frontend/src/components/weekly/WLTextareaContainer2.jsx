import React from 'react';
import Tiptap from '../Tiptap';

const WLTextareaContainer2 = ({ id }) => {
    return (
        <div className="textarea-container">
            <div className="textarea-bg">
                <img
                    className="w-l-input-line-5"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/w-l-input-line-28.svg"
                />
                <img
                    className="w-l-input-line-4"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/w-l-input-line-28.svg"
                />
                <img
                    className="w-l-input-line-3"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/w-l-input-line-28.svg"
                />
                <img
                    className="w-l-input-line-2"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/w-l-input-line-28.svg"
                />
                <img
                    className="w-l-input-line-1"
                    alt="weekly left input line"
                    src="https://c.animaapp.com/eFfbxFd7/img/w-l-input-line-28.svg"
                />
                <Tiptap id={id} />
            </div>
        </div>
    );
};

export default WLTextareaContainer2;