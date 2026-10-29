export function IconPreview({ url, name }: { url: string; name: string }) {
  return <figure className="bb-project-icons-crop-preview">
    <img className="bb-project-icons-large-sample" src={url} alt="Enlarged draft icon" />
    <figcaption><span className="bb-project-icons-sidebar-sample"><img src={url} alt="Draft icon at 20 pixels" />{name}</span><small>Actual sidebar size: 20 × 20 pixels</small></figcaption>
  </figure>;
}
