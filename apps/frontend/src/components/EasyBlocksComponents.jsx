// app/javascript/components/EasyBlocksComponents.jsx
import React from 'react'

export const DummyBanner = (props) => {
  const { Root, Title } = props;
  if (!Root || !Title) return null;
  return (
    <Root.type {...Root.props}>
      <Title.type {...Title.props} />
    </Root.type>
  );
}