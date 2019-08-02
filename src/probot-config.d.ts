declare module "probot-config" {
  function getConfig(context: any, name: string): any;
  export default getConfig;
}
