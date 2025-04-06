// app/javascript/components/EasyBlocksComponents.jsx
import React from 'react'

export const DummyBanner = () => {
  const { Root, Title } = props;
  return (
    <Root.type {...Root.props}>
      <Title.type {...Title.props} />
    </Root.type>
  );
}